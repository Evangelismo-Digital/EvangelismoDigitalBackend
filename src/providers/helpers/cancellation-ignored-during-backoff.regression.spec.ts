/**
 * Defect: after `runWithRetries` was moved onto cockatiel's retry policy, a
 * caller that cancelled *during a backoff delay* was no longer noticed until
 * that delay had run to completion.
 *
 * Why it mattered: the request kept a socket, a Redis rate-limit reservation
 * and the caller's connection alive for up to a full backoff interval after the
 * client had already gone. With the provider defaults that is seconds of work
 * done on behalf of nobody, and it defeats the entire point of threading an
 * AbortSignal through the provider layer.
 *
 * Cause: cockatiel inspects the signal only *before* starting a backoff and
 * then does a bare `await` on the delay (verified in
 * `cockatiel-policy-contract.spec.ts`). Clamping the delay to the remaining
 * budget bounds the wait when the budget itself expires, but an external abort
 * — a disconnect — can arrive long before the budget would have run out, and
 * nothing was watching for it.
 *
 * Fix: race the retry sequence against the deadline's signal, so an abort
 * settles the call immediately; the abandoned sequence finds the budget spent
 * on its next attempt and never reaches the provider.
 *
 * Defect id: R2-1 (self-inflicted during the cockatiel migration, caught by the
 * address/geo decorator suites).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { runWithRetries } from './deadline-retry'
import { Deadline } from 'core/shared/deadline'
import { isErr, isOk } from 'core/shared/result'
import { AxiosError } from 'axios'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

/** A 429 maps to ServiceBusyError, which is RETRYABLE — so it triggers a backoff. */
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

function runParams(overrides: Record<string, unknown>) {
  return {
    providerName: 'TestProvider',
    maxAttempts: 3,
    // Long enough that "did it wait?" is unambiguous.
    backoffMs: 10_000,
    attemptTimeoutMs: 2_000,
    ...overrides,
  } as Parameters<typeof runWithRetries>[0]
}

describe('cancellation ignored during backoff', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('settles as soon as the caller aborts, without waiting out the backoff', async () => {
    const client = new AbortController()
    // An unbounded budget, so only the external abort can end this call — the
    // delay clamp cannot mask the defect.
    const deadline = Deadline.in(Infinity, { linkedTo: client.signal })
    const action = vi.fn().mockRejectedValue(retryableError())

    const run = runWithRetries(runParams({ deadline, action }))

    await vi.advanceTimersByTimeAsync(0)
    expect(action).toHaveBeenCalledTimes(1) // first attempt failed; now in backoff

    client.abort('client desconectou')

    // The assertion that carries the defect: this resolves without the timer
    // ever being advanced. Before the fix it stayed pending for the full 10s.
    const result = await run

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
      expect(result.error.failureMode).toBe(FailureMode.ABORTED)
    }
  })

  it('does not call the provider again after the abandoned backoff finally ends', async () => {
    const client = new AbortController()
    const deadline = Deadline.in(Infinity, { linkedTo: client.signal })
    const action = vi.fn().mockRejectedValue(retryableError())

    const run = runWithRetries(runParams({ deadline, action }))

    await vi.advanceTimersByTimeAsync(0)
    client.abort('client desconectou')
    await run

    // The orphaned cockatiel delay is still pending; when it expires the next
    // attempt must find the budget spent rather than hit the provider.
    await vi.advanceTimersByTimeAsync(60_000)

    expect(action).toHaveBeenCalledTimes(1)
  })

  describe('counterweight — the fix did not make every call return early', () => {
    it('still waits out the backoff and retries when nobody cancels', async () => {
      const deadline = Deadline.in(Infinity)
      const action = vi.fn().mockRejectedValueOnce(retryableError()).mockResolvedValueOnce('recovered')

      const run = runWithRetries(runParams({ deadline, action }))

      await vi.advanceTimersByTimeAsync(0)
      expect(action).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(60_000)
      const result = await run

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBe('recovered')
      expect(action).toHaveBeenCalledTimes(2)
    })

    it('still returns a successful first attempt without any abort machinery', async () => {
      const action = vi.fn().mockResolvedValue('ok')

      const result = await runWithRetries(runParams({ deadline: Deadline.in(30_000), action }))

      expect(isOk(result)).toBe(true)
      expect(action).toHaveBeenCalledTimes(1)
    })
  })
})
