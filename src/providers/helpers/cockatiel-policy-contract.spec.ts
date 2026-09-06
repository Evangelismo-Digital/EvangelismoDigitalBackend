/**
 * Characterization tests for cockatiel itself.
 *
 * The deadline model depends on three library behaviours that are either
 * surprising or undocumented. They are pinned here so that a future cockatiel
 * bump fails loudly in this file — where the cause is obvious — rather than as
 * a subtle extra upstream call or a budget overrun somewhere in the provider
 * chain.
 *
 * This file also serves as the end-to-end proof that the ESM-only cockatiel
 * package is importable from this CommonJS codebase.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  retry,
  handleAll,
  bulkhead,
  circuitBreaker,
  ConsecutiveBreaker,
  ConstantBackoff,
  BrokenCircuitError,
  BulkheadRejectedError,
} from 'cockatiel'

afterEach(() => {
  vi.useRealTimers()
})

describe('cockatiel contract', () => {
  describe('maxAttempts counts retries, not attempts', () => {
    // Our RunWithRetriesParams.maxAttempts means *total* calls ("2 means two
    // calls"), matching IRaw*Provider.maxRetries. cockatiel's means retries
    // after the first. Any adapter must therefore subtract one; passing our
    // value straight through would add an upstream call per request, which no
    // assertion on the returned Result would ever notice.
    it.each([
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
    ])('maxAttempts %i produces %i total calls', async (maxAttempts, expectedCalls) => {
      let calls = 0
      const policy = retry(handleAll, { maxAttempts, backoff: new ConstantBackoff(0) })

      await expect(
        policy.execute(() => {
          calls++
          throw new Error('always fails')
        }),
      ).rejects.toThrow('always fails')

      expect(calls).toBe(expectedCalls)
    })
  })

  describe('an in-flight backoff delay is not cancellable', () => {
    it('runs the delay to completion after an abort, then calls once more', async () => {
      // cockatiel checks `signal.aborted` *before* starting a delay and then
      // does a bare `await`. So an abort landing inside the delay is invisible
      // until it finishes — and the loop then makes another call before
      // noticing. Left alone this both overruns the request budget by up to one
      // backoff interval and spends a rate-limit point after cancellation.
      //
      // This is why the backoff must be capped at the deadline's remaining time
      // rather than left to run free.
      vi.useFakeTimers()

      let calls = 0
      const controller = new AbortController()
      const policy = retry(handleAll, { maxAttempts: 3, backoff: new ConstantBackoff(300) })

      const settled = policy
        .execute(() => {
          calls++
          throw new Error('always fails')
        }, controller.signal)
        .catch(() => 'rejected')

      await vi.advanceTimersByTimeAsync(50)
      expect(calls).toBe(1)

      controller.abort()

      await vi.advanceTimersByTimeAsync(249)
      expect(calls).toBe(1) // the abort did not shorten the pending delay

      await vi.advanceTimersByTimeAsync(1)
      await settled

      expect(calls).toBe(2) // and one more call was made *after* the abort
    })

    it('does not start a new backoff once the signal is already aborted', async () => {
      // The half that does work: the pre-delay check. Without it the policy
      // would keep retrying to exhaustion after cancellation.
      vi.useFakeTimers()

      let calls = 0
      const controller = new AbortController()
      controller.abort()
      const policy = retry(handleAll, { maxAttempts: 5, backoff: new ConstantBackoff(300) })

      await expect(
        policy.execute(() => {
          calls++
          throw new Error('always fails')
        }, controller.signal),
      ).rejects.toThrow('always fails')

      expect(calls).toBe(1)
    })
  })

  describe('the policy errors we map are real, constructible types', () => {
    it('rejects past the bulkhead limit with BulkheadRejectedError', async () => {
      const limit = bulkhead(1)
      let release!: () => void
      const blocker = new Promise<void>((resolve) => {
        release = resolve
      })

      const held = limit.execute(() => blocker)
      await Promise.resolve()

      await expect(limit.execute(() => 'second')).rejects.toBeInstanceOf(BulkheadRejectedError)

      release()
      await held
    })

    it('rejects with BrokenCircuitError once the breaker opens', async () => {
      const breaker = circuitBreaker(handleAll, {
        halfOpenAfter: 10_000,
        breaker: new ConsecutiveBreaker(1),
      })

      await expect(
        breaker.execute(() => {
          throw new Error('upstream down')
        }),
      ).rejects.toThrow('upstream down')

      // Second call never reaches the function: the circuit is open.
      let called = false
      await expect(
        breaker.execute(() => {
          called = true
          return 'ok'
        }),
      ).rejects.toBeInstanceOf(BrokenCircuitError)

      expect(called).toBe(false)
    })
  })
})
