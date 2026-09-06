import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **a finished answer was thrown away because the clock ran out.**
 *
 * The old fetch path re-checked the abort signal *after* the fetcher had
 * already returned, and discarded the result if it had fired in the meantime —
 * without caching it. The work had been paid for in full: an upstream call was
 * made, quota was spent, an answer came back. The next request for the same key
 * then repeated all of it.
 *
 * A deadline stops us starting or waiting on work; it never discards work
 * already finished. Defect D11 in docs/timeout-and-cancellation-model.md.
 */

const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@lib/metrics/cache-metrics', () => ({
  collectMetricsCacheHits: { inc: vi.fn() },
  collectMetricsCacheMisses: { inc: vi.fn() },
  collectMetricsCacheErrors: { inc: vi.fn() },
  collectMetricsCachePendingFetches: { set: vi.fn() },
  collectMetricsCacheFetchDuration: { startTimer: vi.fn(() => vi.fn()) },
  collectMetricsCacheCircuitBreakerTrips: { inc: vi.fn() },
}))

import { ResilientCache } from './resilient-cache'
import { Deadline } from 'core/shared/deadline'
import { ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

describe('regression: work that finished must not be discarded by the clock', () => {
  let cache: ResilientCache<AppError>

  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockResolvedValue('OK')
    cache = new ResilientCache<AppError>({ get: mockRedisGet, set: mockRedisSet } as never, {
      prefix: 'regression:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 30_000,
    })
  })

  it('caches a success the fetcher returned even though the caller had given up', async () => {
    const caller = new AbortController()

    const result = await cache.getOrFetch(
      'key',
      () => {
        const settled = Promise.resolve(ok('expensive answer'))
        caller.abort('caller gave up')
        return settled
      },
      Deadline.in(Infinity, { linkedTo: caller.signal }),
    )

    // The caller who left is told so...
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DeadlineExceededError)
    }

    // ...but the answer is kept, so the next request is a hit, not a repeat.
    await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce())
    expect(JSON.parse(mockRedisSet.mock.calls[0][1] as string)).toMatchObject({
      s: true,
      v: 'expensive answer',
    })
  })

  it('negative-caches a NOT_FOUND the fetcher returned even though the caller had given up', async () => {
    const caller = new AbortController()

    await cache.getOrFetch(
      'key',
      () => {
        const settled = Promise.resolve(err(new InvalidCepError('01310100')))
        caller.abort('caller gave up')
        return settled
      },
      Deadline.in(Infinity, { linkedTo: caller.signal }),
    )

    // "This CEP does not exist" stays true regardless of who was still waiting
    // to hear it, and it is what shields the upstream APIs from being re-asked.
    await vi.waitFor(() => expect(mockRedisSet).toHaveBeenCalledOnce())
    expect(JSON.parse(mockRedisSet.mock.calls[0][1] as string)).toMatchObject({ s: false })
  })

  it('still refuses to cache a failure that says nothing about the key', async () => {
    // The counterweight: keeping finished work must not become "cache anything".
    const caller = new AbortController()

    await cache.getOrFetch(
      'key',
      () => {
        const settled = Promise.resolve(err(new DeadlineExceededError('DEADLINE_EXPIRED')))
        caller.abort('caller gave up')
        return settled
      },
      Deadline.in(Infinity, { linkedTo: caller.signal }),
    )

    await new Promise((resolve) => setImmediate(resolve))
    expect(mockRedisSet).not.toHaveBeenCalled()
  })
})
