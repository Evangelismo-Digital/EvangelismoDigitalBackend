import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **single-flight leaked across a microtask boundary.**
 *
 * Self-inflicted during the P2 refactor. Extracting the "can we answer without
 * fetching?" branch into its own `async` helper put an `await` between the last
 * `pendingFetches` lookup and the `set` that registers the new fetch. Two
 * concurrent callers for the same key could both cross that gap, both see an
 * empty map, and both start a fetch — the stampede protection silently gone,
 * and with it the guarantee that a cold key costs exactly one upstream call.
 *
 * The lookup that guards registration is now deliberately synchronous and sits
 * in the same microtask as the `set`. It reads like a redundant second check;
 * it is not, and this is why.
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
import { Result, ok, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'

/**
 * Lets every parked caller advance to its next await point.
 *
 * Deterministic on purpose: `vi.waitFor` polls on real timers, which under load
 * can lose the race against the cache's own Redis-read budget and fail the test
 * for reasons that have nothing to do with deduplication.
 */
async function drainMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

describe('regression: concurrent callers must produce exactly one upstream call', () => {
  let cache: ResilientCache<AppError>

  beforeEach(() => {
    vi.clearAllMocks()
    mockRedisSet.mockResolvedValue('OK')
    cache = new ResilientCache<AppError>({ get: mockRedisGet, set: mockRedisSet } as never, {
      prefix: 'regression:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 30_000,
    })
  })

  it('coalesces two callers that arrive in the same tick', async () => {
    mockRedisGet.mockResolvedValue(null)
    const fetcher = vi.fn().mockResolvedValue(ok('answer'))

    const results = await Promise.all([
      cache.getOrFetch('key', fetcher, Deadline.in(30_000)),
      cache.getOrFetch('key', fetcher, Deadline.in(30_000)),
    ])

    expect(fetcher).toHaveBeenCalledOnce()
    expect(results.every(isOk)).toBe(true)
  })

  it('coalesces callers that arrive while the Redis read is still in flight', async () => {
    // The exact shape of the bug: the read is awaited, so every caller in the
    // window reaches the registration step believing no fetch exists.
    // Every caller gets its own read promise, so every resolver must be kept —
    // holding only the last one would leave the earlier callers parked.
    const releaseRead: Array<(value: string | null) => void> = []
    mockRedisGet.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          releaseRead.push(resolve)
        }),
    )
    const fetcher = vi.fn().mockResolvedValue(ok('answer'))

    const callers = [
      cache.getOrFetch('key', fetcher, Deadline.in(30_000)),
      cache.getOrFetch('key', fetcher, Deadline.in(30_000)),
      cache.getOrFetch('key', fetcher, Deadline.in(30_000)),
    ]

    // Every caller is now parked on its own read; release them together.
    await drainMicrotasks()
    expect(releaseRead).toHaveLength(3)
    releaseRead.forEach((resolve) => resolve(null))
    const results = await Promise.all(callers)

    expect(fetcher).toHaveBeenCalledOnce()
    expect(results.every(isOk)).toBe(true)
  })

  it('coalesces a burst of twenty callers into one upstream call', async () => {
    mockRedisGet.mockResolvedValue(null)
    let release: (value: Result<string, AppError>) => void = () => {}
    const fetcher = vi.fn(
      () =>
        new Promise<Result<string, AppError>>((resolve) => {
          release = resolve
        }),
    )

    const callers = Array.from({ length: 20 }, () => cache.getOrFetch('key', fetcher, Deadline.in(30_000)))
    await drainMicrotasks()
    release(ok('answer'))

    const results = await Promise.all(callers)

    // Twenty requests for a cold key must cost the upstream provider exactly one.
    expect(fetcher).toHaveBeenCalledOnce()
    expect(results.every(isOk)).toBe(true)
  })
})
