import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getEventListeners } from 'node:events'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { runWithRetries } from './deadline-retry'
import { resetProviderCircuitBreakers } from './provider-circuit-breaker'
import { logger } from '@lib/logger'
import { Deadline } from 'core/shared/deadline'
import { isOk, isErr } from 'core/shared/result'
import { AxiosError } from 'axios'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

/** A 429 maps to ServiceBusyError, which is RETRYABLE. */
function retryableError(): AxiosError {
  return {
    name: 'AxiosError',
    message: 'Request failed with status code 429',
    isAxiosError: true,
    response: { status: 429, data: {}, statusText: '', headers: {}, config: { url: '/viacep/123' } as never },
    config: { url: '/viacep/123' } as never,
    toJSON: () => ({}),
  } as AxiosError
}

/** A 404 from an address provider maps to InvalidCepError, which is NOT_FOUND. */
function notFoundError(): AxiosError {
  return {
    name: 'AxiosError',
    message: 'Request failed with status code 404',
    isAxiosError: true,
    response: { status: 404, data: {}, statusText: '', headers: {}, config: { url: '/viacep/01310100' } as never },
    config: { url: '/viacep/01310100' } as never,
    toJSON: () => ({}),
  } as AxiosError
}

function params<T>(overrides: Partial<Parameters<typeof runWithRetries<T>>[0]> = {}) {
  return {
    deadline: Deadline.none(),
    providerName: 'TestProvider',
    maxAttempts: 2,
    // Zero backoff keeps these tests free of any real waiting.
    backoffMs: 0,
    attemptTimeoutMs: 2_000,
    action: vi.fn(),
    ...overrides,
  } as Parameters<typeof runWithRetries<T>>[0] & { action: ReturnType<typeof vi.fn> }
}

/** The `delay` field of every retry log emitted so far, in order. */
function loggedDelays(): number[] {
  return vi.mocked(logger.warn).mock.calls.map((call) => (call[0] as unknown as { delay: number }).delay)
}

describe('runWithRetries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
  })

  it('returns the value from a first attempt that succeeds', async () => {
    const p = params({ action: vi.fn().mockResolvedValue('ok') })

    const result = await runWithRetries(p)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe('ok')
    expect(p.action).toHaveBeenCalledTimes(1)
  })

  it('retries a RETRYABLE failure and returns the later success', async () => {
    const action = vi.fn().mockRejectedValueOnce(retryableError()).mockResolvedValueOnce('recovered')
    const p = params({ action })

    const result = await runWithRetries(p)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe('recovered')
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('stops on a non-retryable failure without spending the remaining attempts', async () => {
    const action = vi.fn().mockRejectedValue(notFoundError())
    const p = params({ maxAttempts: 3, action })

    const result = await runWithRetries(p)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(InvalidCepError)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('surfaces the last error once the attempts are exhausted', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())
    const p = params({ maxAttempts: 2, action })

    const result = await runWithRetries(p)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
    expect(action).toHaveBeenCalledTimes(2)
  })

  it('always makes at least one attempt, even if configured with none', async () => {
    // A misconfigured 0 must not silently report the provider as busy.
    const action = vi.fn().mockResolvedValue('ok')
    const p = params({ maxAttempts: 0, action })

    const result = await runWithRetries(p)

    expect(isOk(result)).toBe(true)
    expect(action).toHaveBeenCalledTimes(1)
  })

  describe('budget propagation', () => {
    it('hands the action a deadline that cannot outlive the parent', async () => {
      // The clock is frozen because `remainingMs()` reads `Date.now()` on every
      // call: comparing the attempt's remaining budget with the parent's under a
      // *moving* clock samples two different instants, and the parent — read
      // second — comes back smaller. That is a defect in the comparison, not in
      // the budget, and it surfaced as "expected 500 to be less than or equal to
      // 499" once coverage instrumentation widened the gap past a millisecond.
      vi.useFakeTimers()

      try {
        const parent = Deadline.in(500)
        const action = vi.fn().mockResolvedValue('ok')

        await runWithRetries(params({ deadline: parent, attemptTimeoutMs: 30_000, action }))

        const attempt = action.mock.calls[0][0] as Deadline
        expect(attempt.expiresAt).toBeLessThanOrEqual(parent.expiresAt)
        expect(attempt.remainingMs()).toBeLessThanOrEqual(parent.remainingMs())
      } finally {
        vi.useRealTimers()
      }
    })

    it('leaves no abort listener behind on a reused deadline', async () => {
      // The retry sequence is raced against the deadline's signal, and that
      // listener must be removed when the call settles. A request deadline is
      // shared by every provider in a fallback chain, so a leak here grows one
      // listener per call for the life of the request.
      const deadline = Deadline.in(30_000)
      const action = vi.fn().mockResolvedValue('ok')

      for (let call = 0; call < 5; call += 1) {
        await runWithRetries(params({ deadline, action }))
      }

      expect(getEventListeners(deadline.signal, 'abort')).toHaveLength(0)
    })

    it('narrows the attempt to the provider ceiling when the parent has more to give', async () => {
      const action = vi.fn().mockResolvedValue('ok')

      await runWithRetries(params({ deadline: Deadline.in(60_000), attemptTimeoutMs: 2_000, action }))

      const attempt = action.mock.calls[0][0] as Deadline
      expect(attempt.remainingMs()).toBeLessThanOrEqual(2_000)
    })

    it('never starts an attempt on an already-spent budget', async () => {
      const action = vi.fn().mockResolvedValue('ok')
      const expired = Deadline.in(0)

      const result = await runWithRetries(params({ deadline: expired, action }))

      expect(action).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    })

    it('skips an attempt that the remaining budget cannot fit', async () => {
      // Below the floor the request would be aborted before any answer could
      // arrive, while still costing a rate-limit point and a socket.
      const action = vi.fn().mockResolvedValue('ok')
      const barelyAny = Deadline.in(10)

      const result = await runWithRetries(params({ deadline: barelyAny, action }))

      expect(action).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    })
  })

  describe('failure classification', () => {
    it('reports a spent parent budget as terminal ABORTED, not a retryable timeout', async () => {
      // The realistic shape: the client disconnects (or the budget runs out)
      // while a provider call is in flight, and the call then fails.
      const client = new AbortController()
      const parent = Deadline.in(5_000, { linkedTo: client.signal })
      const action = vi.fn().mockImplementation(async () => {
        client.abort('client desconectou')
        throw new Error('socket hang up')
      })

      // maxAttempts 1 so the classification is the only way to this outcome —
      // otherwise the next iteration's budget check would mask it.
      const result = await runWithRetries(params({ deadline: parent, maxAttempts: 1, action }))

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
        expect(result.error.failureMode).toBe(FailureMode.ABORTED)
      }
      // Terminal: no second attempt on a budget that is already gone.
      expect(action).toHaveBeenCalledTimes(1)
    })

    it('maps an ordinary failure normally while the parent still has budget', async () => {
      const action = vi.fn().mockRejectedValue(new Error('socket hang up'))

      const result = await runWithRetries(params({ deadline: Deadline.in(60_000), maxAttempts: 1, action }))

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ProviderFailureError)
        expect(result.error.failureMode).toBe(FailureMode.RETRYABLE)
      }
    })
  })
})

describe('runWithRetries diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
  })

  it('logs each retry with the attempt number and the delay it is about to wait', async () => {
    const action = vi.fn().mockRejectedValueOnce(retryableError()).mockResolvedValueOnce('ok')

    await runWithRetries(params({ maxAttempts: 2, backoffMs: 100, action, logContext: { cep: '01310100' } }))

    // The delay is jittered, so it is asserted as a bound rather than a fixed
    // number: `maxDelay` is pinned to the largest step the old fixed schedule
    // would have taken (backoffMs * 2^(maxAttempts-1) = 200), so jitter varies
    // inside the previous envelope and can never extend it.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        cep: '01310100',
        attempt: 1,
        delay: expect.any(Number),
      }),
      expect.stringContaining('TestProvider'),
    )
    expect(loggedDelays()[0]).toBeLessThanOrEqual(200)
  })

  it('logs nothing when the budget was already spent before any attempt', async () => {
    // Nothing was asked of the provider, so nothing about the provider failed.
    // Logging here would fill the error log — and Sentry — with entries about
    // callers that had already gone away.
    const action = vi.fn().mockResolvedValue('ok')

    await runWithRetries(params({ deadline: Deadline.in(0), action, logContext: { cep: '01310100' } }))

    expect(action).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs the failure that exhausted the attempts, with the attempt number and error', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())

    await runWithRetries(params({ maxAttempts: 2, action, logContext: { cep: '01310100' } }))

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ cep: '01310100', attempt: 2, error: expect.anything() }),
      expect.stringContaining('TestProvider'),
    )
  })
})

describe('runWithRetries backoff schedule', () => {
  beforeEach(() => {
    // Delays are read back out of the retry log, so the log must start empty
    // in every test — these describes are top level and inherit no clearing.
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
    vi.useFakeTimers()
    // Jitter is deliberate randomness; pinning Math.random makes the schedule
    // reproducible without pretending the jitter is not there.
    vi.spyOn(Math, 'random').mockReturnValue(0.5)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('waits between attempts, and each delay stays inside the old fixed envelope', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())
    const run = runWithRetries(params({ maxAttempts: 3, backoffMs: 100, action }))

    await vi.advanceTimersByTimeAsync(0)
    expect(action).toHaveBeenCalledTimes(1)

    // Well past both envelopes: maxDelay is 100 * 2^2 = 400 per retry.
    await vi.advanceTimersByTimeAsync(1_000)
    expect(action).toHaveBeenCalledTimes(3)

    await run

    const delays = loggedDelays()
    expect(delays).toHaveLength(2)
    for (const delay of delays) {
      expect(delay).toBeGreaterThan(0)
      expect(delay).toBeLessThanOrEqual(400)
    }
  })

  it('lets a jittered delay exceed one backoff unit, up to the envelope', async () => {
    // Decorrelated jitter is not capped at `initialDelay` — it spreads *around*
    // the exponential curve, so a single delay may exceed one backoff unit
    // while staying inside the envelope. A ceiling collapsed to `backoffMs`
    // would quietly turn the schedule back into a constant.
    vi.spyOn(Math, 'random').mockReturnValue(0.99)
    const action = vi.fn().mockRejectedValue(retryableError())
    const run = runWithRetries(params({ maxAttempts: 3, backoffMs: 100, action }))

    await vi.advanceTimersByTimeAsync(0)
    const [delay] = loggedDelays()

    expect(delay).toBeGreaterThan(100)
    expect(delay).toBeLessThanOrEqual(400)

    await vi.advanceTimersByTimeAsync(1_000)
    await run
  })

  it('grows the delay from one retry to the next', async () => {
    // The exponential shape survives the jitter: what changed is that the value
    // is no longer identical across every client retrying the same provider.
    const action = vi.fn().mockRejectedValue(retryableError())
    const run = runWithRetries(params({ maxAttempts: 3, backoffMs: 100, action }))

    await vi.advanceTimersByTimeAsync(1_000)
    await run

    const [first, second] = loggedDelays()
    expect(second).toBeGreaterThan(first)
  })

  it('does not retry before the jittered delay has elapsed', async () => {
    const action = vi.fn().mockRejectedValue(retryableError())
    const run = runWithRetries(params({ maxAttempts: 2, backoffMs: 100, action }))

    await vi.advanceTimersByTimeAsync(0)
    const [delay] = loggedDelays()
    expect(delay).toBeGreaterThan(1)

    await vi.advanceTimersByTimeAsync(Math.floor(delay) - 1)
    expect(action).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(2)
    expect(action).toHaveBeenCalledTimes(2)

    await run
  })

  it('never sleeps past the remaining budget', async () => {
    // cockatiel cannot cancel a delay once it has started — it checks the
    // signal only *before* sleeping. An uncapped backoff would therefore make
    // the request outlive its budget by up to one full interval, so the
    // delegate clamps every delay to what is actually left.
    // The budget (300ms) is far smaller than the configured backoff (10s), so
    // an unclamped delay would be ~9s — thirty times the request's whole
    // remaining life.
    const action = vi.fn().mockRejectedValue(retryableError())
    const run = runWithRetries(params({ maxAttempts: 3, backoffMs: 10_000, deadline: Deadline.in(300), action }))

    await vi.advanceTimersByTimeAsync(0)
    const [delay] = loggedDelays()

    expect(delay).toBeLessThanOrEqual(300)

    await vi.advanceTimersByTimeAsync(60_000)
    await run
  })

  it('leaves no attempt timer behind', async () => {
    const before = vi.getTimerCount()
    const action = vi.fn().mockResolvedValue('ok')

    await runWithRetries(params({ deadline: Deadline.in(30_000), action }))

    // Each attempt derives its own deadline; none may outlive the call.
    expect(vi.getTimerCount()).toBe(before + 1) // only the parent's own timer
  })

  it('runs an attempt with exactly the minimum budget, and skips one below it', async () => {
    const atFloor = vi.fn().mockResolvedValue('ok')
    await runWithRetries(params({ deadline: Deadline.in(50), action: atFloor }))
    expect(atFloor).toHaveBeenCalledTimes(1)

    const belowFloor = vi.fn().mockResolvedValue('ok')
    await runWithRetries(params({ deadline: Deadline.in(49), action: belowFloor }))
    expect(belowFloor).not.toHaveBeenCalled()
  })
})
