import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fc from 'fast-check'
import { Deadline, DEADLINE_EXPIRED_REASON } from './deadline'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'

/**
 * Fake timers throughout: a deadline is pure clock arithmetic, so freezing the
 * clock is what makes the assertions exact rather than approximate. No test
 * here sleeps.
 */
describe('Deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('in()', () => {
    it('starts with the full budget remaining and unexpired', () => {
      const deadline = Deadline.in(1_000)

      expect(deadline.remainingMs()).toBe(1_000)
      expect(deadline.expired).toBe(false)
      expect(deadline.signal.aborted).toBe(false)
    })

    it('spends its budget as the clock advances', () => {
      const deadline = Deadline.in(1_000)

      vi.advanceTimersByTime(400)

      expect(deadline.remainingMs()).toBe(600)
      expect(deadline.expired).toBe(false)
    })

    it('expires and aborts its signal once the budget runs out', () => {
      const deadline = Deadline.in(1_000)

      vi.advanceTimersByTime(1_000)

      expect(deadline.remainingMs()).toBe(0)
      expect(deadline.expired).toBe(true)
      expect(deadline.signal.aborted).toBe(true)
      expect(deadline.signal.reason).toBe(DEADLINE_EXPIRED_REASON)
      expect(DEADLINE_EXPIRED_REASON).toBe('DEADLINE_EXPIRED')
    })

    it('is already expired for a zero budget, before any timer could fire', () => {
      const deadline = Deadline.in(0)

      // Deliberately no timer advance: `expired` must not wait for the tick.
      expect(deadline.expired).toBe(true)
      expect(deadline.remainingMs()).toBe(0)
    })

    it('clamps a negative budget to zero instead of reporting time remaining', () => {
      const deadline = Deadline.in(-5_000)

      expect(deadline.remainingMs()).toBe(0)
      expect(deadline.expired).toBe(true)
    })

    it('unrefs its timer, so a pending budget never keeps the process alive', () => {
      const unref = vi.fn()
      const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockReturnValue({ unref } as never)

      try {
        Deadline.in(30_000)
      } finally {
        setTimeoutSpy.mockRestore()
      }

      expect(unref).toHaveBeenCalledTimes(1)
    })
  })

  describe('none()', () => {
    it('never expires, however far the clock advances', () => {
      const deadline = Deadline.none()

      vi.advanceTimersByTime(60 * 60 * 1_000)

      expect(deadline.remainingMs()).toBe(Infinity)
      expect(deadline.expired).toBe(false)
      expect(deadline.signal.aborted).toBe(false)
    })

    it('still hands out bounded children', () => {
      const child = Deadline.none().derive(500)

      expect(child.remainingMs()).toBe(500)

      vi.advanceTimersByTime(500)

      expect(child.expired).toBe(true)
      expect(child.signal.aborted).toBe(true)
    })

    it('survives dispose() without throwing', () => {
      const deadline = Deadline.none()

      expect(() => {
        deadline.dispose()
        deadline.dispose()
      }).not.toThrow()

      expect(deadline.expired).toBe(false)
    })
  })

  describe('degenerate budgets', () => {
    // Node clamps a setTimeout delay over 2^31-1 to 1ms, so these inputs would
    // otherwise abort everything on the next tick with only a stderr warning.
    it.each([
      ['Infinity', Infinity],
      ['NaN (a misparsed config value)', NaN],
    ])('treats a %s budget as unbounded rather than aborting instantly', (_label, budget) => {
      const deadline = Deadline.in(budget)

      vi.advanceTimersByTime(10)

      expect(deadline.signal.aborted).toBe(false)
      expect(deadline.expired).toBe(false)
    })

    it('still honours an external canceller on an unbounded budget', () => {
      const client = new AbortController()
      const deadline = Deadline.in(Infinity, { linkedTo: client.signal })

      expect(deadline.expired).toBe(false)
      client.abort('client desconectou')

      expect(deadline.expired).toBe(true)
    })

    it('does not abort instantly for a budget past the 32-bit timer limit', () => {
      const deadline = Deadline.in(2 ** 31 + 1)

      vi.advanceTimersByTime(10)

      expect(deadline.signal.aborted).toBe(false)
      expect(deadline.expired).toBe(false)
    })

    it('never lets a non-finite cap produce an unbounded child of a bounded parent', () => {
      const parent = Deadline.in(1_000)

      const child = parent.derive(NaN)

      // The cap is discarded, the parent is not.
      expect(child.expiresAt).toBe(parent.expiresAt)
      expect(child.remainingMs()).toBe(1_000)

      vi.advanceTimersByTime(1_000)
      expect(child.expired).toBe(true)
    })
  })

  describe('derive()', () => {
    it('shrinks to its own cap when the parent has more budget than requested', () => {
      const parent = Deadline.in(5_000)

      const child = parent.derive(800)

      expect(child.remainingMs()).toBe(800)
      expect(child.expiresAt).toBeLessThan(parent.expiresAt)
    })

    it('clamps to the parent when its own cap is larger — the child cannot borrow time', () => {
      const parent = Deadline.in(1_000)

      const child = parent.derive(30_000)

      expect(child.remainingMs()).toBe(1_000)
      expect(child.expiresAt).toBe(parent.expiresAt)
    })

    it('keeps shrinking across nesting depth', () => {
      const parent = Deadline.in(5_000)
      const leg = parent.derive(3_000)
      const attempt = leg.derive(2_000)

      expect(leg.remainingMs()).toBe(3_000)
      expect(attempt.remainingMs()).toBe(2_000)
      expect(attempt.expiresAt).toBeLessThanOrEqual(leg.expiresAt)
      expect(leg.expiresAt).toBeLessThanOrEqual(parent.expiresAt)
    })

    it('accounts for time the parent already spent', () => {
      const parent = Deadline.in(1_000)

      vi.advanceTimersByTime(700)
      const child = parent.derive(5_000)

      // Only the parent's remaining 300ms is available, not the requested 5s.
      expect(child.remainingMs()).toBe(300)
    })

    it('hands an already-expired child to a caller with no budget left', () => {
      const parent = Deadline.in(1_000)

      vi.advanceTimersByTime(1_000)
      const child = parent.derive(2_000)

      expect(child.remainingMs()).toBe(0)
      expect(child.expired).toBe(true)
    })

    it('aborts the child when the parent expires first', () => {
      const parent = Deadline.in(1_000)
      const child = parent.derive(900)

      vi.advanceTimersByTime(900)

      expect(child.signal.aborted).toBe(true)
      expect(parent.expired).toBe(false)
    })

    it('does not abort the parent when only the child expires', () => {
      const parent = Deadline.in(5_000)
      const child = parent.derive(500)

      vi.advanceTimersByTime(500)

      expect(child.expired).toBe(true)
      expect(parent.expired).toBe(false)
      expect(parent.signal.aborted).toBe(false)
    })
  })

  describe('external cancellation (linkedTo)', () => {
    it('expires the moment the linked signal aborts, budget notwithstanding', () => {
      const client = new AbortController()
      const deadline = Deadline.in(30_000, { linkedTo: client.signal })

      client.abort('client desconectou')

      expect(deadline.expired).toBe(true)
      expect(deadline.remainingMs()).toBeGreaterThan(0)
      expect(deadline.signal.reason).toBe('client desconectou')
    })

    it('cascades an external abort down every level of nesting', () => {
      const client = new AbortController()
      const request = Deadline.in(8_000, { linkedTo: client.signal })
      const leg = request.derive(3_000)
      const attempt = leg.derive(2_000)

      client.abort('client desconectou')

      expect(request.signal.aborted).toBe(true)
      expect(leg.signal.aborted).toBe(true)
      expect(attempt.signal.aborted).toBe(true)
      expect(attempt.expired).toBe(true)
    })
  })

  describe('asError()', () => {
    it('reports the deadline as an ABORTED DeadlineExceededError', () => {
      const error = Deadline.in(10).asError()

      expect(error).toBeInstanceOf(DeadlineExceededError)
      expect(error.failureMode).toBe(FailureMode.ABORTED)
      expect(error.telemetryReason).toBe(TelemetryReason.DEADLINE_EXCEEDED)
      expect(error.type).toBe(ErrorType.SERVICE_UNAVAILABLE)
      // Sentry and the log pipeline group by `name`, so it must survive construction.
      expect(error.name).toBe('DeadlineExceededError')
    })

    it('carries the timer reason once the budget is spent', () => {
      const deadline = Deadline.in(100)

      vi.advanceTimersByTime(100)

      expect(deadline.asError().originalError).toBe(DEADLINE_EXPIRED_REASON)
    })

    it('falls back to the generic marker when the external reason is empty', () => {
      const client = new AbortController()
      const deadline = Deadline.in(30_000, { linkedTo: client.signal })

      client.abort('')

      // An abort carrying '' says nothing actionable; a blank cause is worse
      // than a generic one.
      expect(deadline.asError().originalError).toBe(DEADLINE_EXPIRED_REASON)
    })

    it('carries the external reason when cancellation came from outside', () => {
      const client = new AbortController()
      const deadline = Deadline.in(30_000, { linkedTo: client.signal })

      client.abort('client desconectou')

      expect(deadline.asError().originalError).toBe('client desconectou')
    })
  })

  describe('dispose()', () => {
    it('releases the pending timer', () => {
      const before = vi.getTimerCount()
      const deadline = Deadline.in(60_000)
      expect(vi.getTimerCount()).toBe(before + 1)

      deadline.dispose()

      expect(vi.getTimerCount()).toBe(before)
    })

    it('is idempotent', () => {
      const before = vi.getTimerCount()
      const deadline = Deadline.in(60_000)

      deadline.dispose()
      deadline.dispose()

      expect(vi.getTimerCount()).toBe(before)
    })

    it('releases the timer without cancelling — disposal is not abortion', () => {
      const parent = Deadline.in(60_000)
      const child = parent.derive(30_000)

      parent.dispose()

      expect(parent.signal.aborted).toBe(false)
      expect(child.signal.aborted).toBe(false)
      expect(child.expired).toBe(false)
    })
  })

  describe('invariants (property-based)', () => {
    const budget = () => fc.integer({ min: 0, max: 120_000 })

    /** Includes the values that silently break `setTimeout` and `Math.min`. */
    const anyBudget = () =>
      fc.oneof(budget(), fc.constant(Infinity), fc.constant(NaN), fc.constant(-1), fc.constant(2 ** 31 + 1))

    it('never lets a derived deadline outlive its parent, for any input at all', () => {
      fc.assert(
        fc.property(anyBudget(), anyBudget(), (parentMs, childMs) => {
          const parent = Deadline.in(parentMs)
          const child = parent.derive(childMs)

          expect(child.expiresAt).toBeLessThanOrEqual(parent.expiresAt)
          expect(child.remainingMs()).toBeLessThanOrEqual(parent.remainingMs())

          child.dispose()
          parent.dispose()
        }),
      )
    })

    it('never grants a child more than the cap it asked for', () => {
      fc.assert(
        fc.property(budget(), budget(), (parentMs, childMs) => {
          const parent = Deadline.in(parentMs)
          const child = parent.derive(childMs)

          expect(child.remainingMs()).toBeLessThanOrEqual(childMs)

          child.dispose()
          parent.dispose()
        }),
      )
    })

    it('is monotonically non-increasing down an arbitrary chain of derives', () => {
      fc.assert(
        fc.property(budget(), fc.array(budget(), { minLength: 1, maxLength: 8 }), (rootMs, caps) => {
          const root = Deadline.in(rootMs)
          const chain = caps.reduce<Deadline[]>((acc, cap) => [...acc, acc[acc.length - 1].derive(cap)], [root])

          chain.forEach((deadline, index) => {
            if (index > 0) {
              expect(deadline.expiresAt).toBeLessThanOrEqual(chain[index - 1].expiresAt)
            }
          })

          chain.forEach((deadline) => deadline.dispose())
        }),
      )
    })

    it('never reports negative time remaining, at any point in the budget', () => {
      fc.assert(
        fc.property(budget(), budget(), (budgetMs, elapsedMs) => {
          const deadline = Deadline.in(budgetMs)

          vi.advanceTimersByTime(elapsedMs)

          expect(deadline.remainingMs()).toBeGreaterThanOrEqual(0)
          expect(deadline.remainingMs()).toBeLessThanOrEqual(budgetMs)
          expect(deadline.expired).toBe(elapsedMs >= budgetMs)

          deadline.dispose()
        }),
      )
    })

    it('treats an unbounded parent as unlimited without letting the child inherit that', () => {
      fc.assert(
        fc.property(budget(), (childMs) => {
          const child = Deadline.none().derive(childMs)

          expect(child.expiresAt).toBeLessThan(Infinity)
          expect(child.remainingMs()).toBe(childMs)

          child.dispose()
        }),
      )
    })
  })
})
