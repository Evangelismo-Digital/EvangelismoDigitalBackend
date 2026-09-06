import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Deadline } from './deadline'

/**
 * Regression: **a misconfigured budget cancelled every request instantly.**
 *
 * Node clamps any `setTimeout` delay above 2³¹−1 ms — `Infinity` and `NaN`
 * included — down to **1 ms**, warning only on stderr. An unguarded
 * `Deadline.in(Infinity)`, or a `NaN` from a misparsed config value, therefore
 * armed a timer that fired on the very next tick: every request was aborted
 * immediately while `remainingMs()` still reported the full budget, and the only
 * clue was a `TimeoutOverflowWarning` nobody reads.
 *
 * Separately, `Math.min(finite, NaN)` is `NaN`, so a non-finite cap passed to
 * `derive` produced an *unbounded child of a bounded parent* — the one input
 * able to break this class's central invariant.
 *
 * Found by code review of P0; see docs/timeout-and-cancellation-model.md §3.
 */
describe('regression: degenerate budgets must not cancel everything', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['Infinity', Infinity],
    ['NaN, as a misparsed config value would give', NaN],
    ['a budget past the 32-bit timer limit', 2 ** 31 + 1],
  ])('does not abort on the next tick for %s', (_label, budget) => {
    const deadline = Deadline.in(budget)

    vi.advanceTimersByTime(1)

    expect(deadline.signal.aborted).toBe(false)
    expect(deadline.expired).toBe(false)
  })

  it('keeps an unbounded budget cancellable from outside', () => {
    // Treating a non-finite budget as unbounded must not also drop the caller's
    // only remaining way to stop the work.
    const client = new AbortController()
    const deadline = Deadline.in(Infinity, { linkedTo: client.signal })

    vi.advanceTimersByTime(1)
    expect(deadline.expired).toBe(false)

    client.abort('client disconnected')
    expect(deadline.expired).toBe(true)
  })

  it('never lets a non-finite cap produce an unbounded child of a bounded parent', () => {
    const parent = Deadline.in(1_000)

    const child = parent.derive(NaN)

    // The nonsense cap is discarded; the parent's bound is not.
    expect(child.expiresAt).toBe(parent.expiresAt)
    expect(child.remainingMs()).toBe(1_000)

    vi.advanceTimersByTime(1_000)
    expect(child.expired).toBe(true)
  })

  it('reports a usable cause when cancelled with an empty reason', () => {
    // `??` let an abort reason of '' through, producing an error whose cause was
    // a blank string — strictly worse than the generic marker.
    const client = new AbortController()
    const deadline = Deadline.in(30_000, { linkedTo: client.signal })

    client.abort('')

    expect(deadline.asError().originalError).toBe('DEADLINE_EXPIRED')
  })
})
