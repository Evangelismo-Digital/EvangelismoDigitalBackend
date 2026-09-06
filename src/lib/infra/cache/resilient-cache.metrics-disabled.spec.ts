/**
 * Every collector in @lib/metrics/cache-metrics is `null` when the Prometheus
 * registry is absent — that is the shipped behaviour when METRICS_ENABLED is
 * off. The cache guards each collector with `?.`, so this file pins that the
 * whole class keeps working with metrics disabled: a dropped guard would crash
 * the request path in production rather than merely lose telemetry.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/env', () => ({
  env: { NODE_ENV: 'test', LOG_LEVEL: 'info', APP_NAME: 'Test' },
}))

vi.mock('@lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

// The whole point of this file: metrics are OFF.
vi.mock('@lib/metrics/cache-metrics', () => ({
  collectMetricsCacheHits: null,
  collectMetricsCacheMisses: null,
  collectMetricsCacheErrors: null,
  collectMetricsCachePendingFetches: null,
  collectMetricsCacheFetchDuration: null,
  collectMetricsCacheCircuitBreakerTrips: null,
}))

import { ResilientCache } from './resilient-cache'
import { ok, err, isOk, isErr, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { ServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { Deadline } from 'core/shared/deadline'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

class TestAppError extends AppError {
  constructor(failureMode: FailureMode = FailureMode.NOT_FOUND) {
    super({ code: 'TEST', message: 'Test error' }, 'INTERNAL_SERVER_ERROR' as never, failureMode)
  }
}

describe('ResilientCache with Prometheus metrics disabled', () => {
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }
  let cache: ResilientCache<AppError>

  beforeEach(() => {
    vi.clearAllMocks()
    redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }
    cache = new ResilientCache<AppError>(redis as never, {
      prefix: 'nometrics:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 50,
    })
  })

  it('serves a cache miss and writes the entry', async () => {
    const result = await cache.getOrFetch('k', async () => ok('value'))

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe('value')
    expect(redis.set).toHaveBeenCalledTimes(1)
  })

  it('serves a cache hit', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ s: true, v: 'cached' }))

    const result = await cache.getOrFetch('k', vi.fn())

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe('cached')
  })

  it('serves a negative cache hit', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ s: false, e: { type: 'Whatever', message: 'nope' } }))

    const result = await cache.getOrFetch('k', vi.fn())

    expect(isErr(result)).toBe(true)
  })

  it('writes a negative envelope for a non-retryable failure', async () => {
    const result = await cache.getOrFetch('k', async () => err(new TestAppError(FailureMode.NOT_FOUND)))

    expect(isErr(result)).toBe(true)
    expect(redis.set).toHaveBeenCalledTimes(1)
  })

  it('reports a corrupted success envelope without crashing', async () => {
    redis.get.mockResolvedValue(JSON.stringify({ s: true }))

    const result = await cache.getOrFetch('k', vi.fn())

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ProviderFailureError)
  })

  it('survives an unparseable payload', async () => {
    redis.get.mockResolvedValue('not json')

    const result = await cache.getOrFetch('k', async () => ok('fresh'))

    expect(isOk(result)).toBe(true)
  })

  it('survives a Redis read failure', async () => {
    redis.get.mockRejectedValue(new Error('redis down'))

    const result = await cache.getOrFetch('k', async () => ok('fresh'))

    expect(isOk(result)).toBe(true)
  })

  it('survives a Redis write failure', async () => {
    redis.set.mockRejectedValue(new Error('redis down'))

    const result = await cache.getOrFetch('k', async () => ok('fresh'))

    expect(isOk(result)).toBe(true)
  })

  it('still trips the circuit breaker', async () => {
    const limited = new ResilientCache<AppError>(redis as never, {
      prefix: 'nometrics:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 5_000,
      maxPendingFetches: 1,
    })

    const inflight = limited.getOrFetch('busy', () => new Promise<Result<string, AppError>>(() => {}))
    await new Promise((resolve) => setImmediate(resolve))

    const rejected = await limited.getOrFetch('other', vi.fn())

    expect(isErr(rejected)).toBe(true)
    if (isErr(rejected)) expect(rejected.error).toBeInstanceOf(ServiceOverloadError)
    void inflight
  })

  it('still deduplicates concurrent callers', async () => {
    let release!: (r: Result<string, AppError>) => void
    const fetcher = vi.fn(
      () =>
        new Promise<Result<string, AppError>>((res) => {
          release = res
        }),
    )

    const first = cache.getOrFetch('k', fetcher)
    await new Promise((resolve) => setImmediate(resolve))
    const second = cache.getOrFetch('k', fetcher)

    release(ok('shared'))
    await Promise.all([first, second])

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('still times out a stalled fetch, and observes no duration timer', async () => {
    vi.useFakeTimers()
    try {
      const pending = cache.getOrFetch('k', () => new Promise<Result<string, AppError>>(() => {}))
      await vi.advanceTimersByTimeAsync(200)
      const result = await pending

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('still honours an aborted caller signal', async () => {
    const controller = new AbortController()
    controller.abort('gone')

    const fetcher = vi.fn()
    const result = await cache.getOrFetch('k', fetcher, Deadline.in(Infinity, { linkedTo: controller.signal }))

    expect(isErr(result)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
