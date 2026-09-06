/**
 * The cache's concurrency limit and circuit breaker.
 *
 * Both guard the *shared fetch*, which is the only thing that costs an upstream
 * anything. Callers answered from Redis, or joining a fetch already in flight,
 * must pass through untouched — putting either policy at the entry point would
 * count callers instead of fetches and quietly shrink the effective limit.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@lib/metrics/cache-metrics', () => ({
  collectMetricsCacheHits: null,
  collectMetricsCacheMisses: null,
  collectMetricsCacheErrors: null,
  collectMetricsCachePendingFetches: null,
  collectMetricsCacheFetchDuration: null,
  collectMetricsCacheCircuitBreakerTrips: null,
}))

import { ResilientCache, ResilientCacheOptions } from './resilient-cache'
import { ok, err, isOk, isErr, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { ServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { CircuitOpenError } from 'errors/infrastructure/circuit-open-error'

class TestAppError extends AppError {
  constructor(failureMode: FailureMode) {
    super({ code: 'TEST', message: 'Test error' }, 'INTERNAL_SERVER_ERROR' as never, failureMode)
  }
}

const BREAKER = {
  failureThreshold: 0.5,
  // A short window with a throughput floor of 1: two failed fetches suffice,
  // rather than the ~150 the production settings deliberately require.
  samplingWindowMs: 1_000,
  minimumThroughput: 1,
  halfOpenAfterMs: 10_000,
}

describe('cache fetch policies', () => {
  let redis: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }

  function makeCache(overrides: Partial<ResilientCacheOptions<AppError>> = {}) {
    return new ResilientCache<AppError>(redis as never, {
      prefix: 'policies:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 30,
      fetchTimeoutMs: 5_000,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    redis = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue('OK') }
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the limiter counts fetches, not callers', () => {
    it('lets many callers share one slot when they deduplicate onto one key', async () => {
      // The placement property. Ten callers, one key, one fetch — a bulkhead
      // wrapped around each *caller* would reject nine of them against a limit
      // of one, even though only a single upstream call is ever made.
      const cache = makeCache({ maxPendingFetches: 1 })
      let release!: (r: Result<string, AppError>) => void
      const fetcher = vi.fn(
        () =>
          new Promise<Result<string, AppError>>((resolve) => {
            release = resolve
          }),
      )

      const callers = Array.from({ length: 10 }, () => cache.getOrFetch('same-key', fetcher))
      await new Promise((resolve) => setImmediate(resolve))

      release(ok('shared'))
      const results = await Promise.all(callers)

      expect(fetcher).toHaveBeenCalledTimes(1)
      for (const result of results) {
        expect(isOk(result)).toBe(true)
      }
    })

    it('lets a late caller join an already-registered fetch without a slot', async () => {
      // The other deduplication path. Callers that arrive together dedup inside
      // startFetch; one that arrives *after* the fetch is registered joins via
      // tryJoinPendingFetch instead, and must also pass through free — with the
      // single slot already held by the fetch itself, a limiter on that path
      // would reject it outright.
      const cache = makeCache({ maxPendingFetches: 1 })
      let release!: (r: Result<string, AppError>) => void
      const fetcher = vi.fn(
        () =>
          new Promise<Result<string, AppError>>((resolve) => {
            release = resolve
          }),
      )

      const first = cache.getOrFetch('same-key', fetcher)
      await new Promise((resolve) => setImmediate(resolve))

      const late = cache.getOrFetch('same-key', fetcher)

      release(ok('shared'))
      const [firstResult, lateResult] = await Promise.all([first, late])

      expect(fetcher).toHaveBeenCalledTimes(1)
      expect(isOk(firstResult)).toBe(true)
      expect(isOk(lateResult)).toBe(true)
    })

    it('rejects a second distinct key once the only slot is taken', async () => {
      const cache = makeCache({ maxPendingFetches: 1 })
      const stalled = vi.fn(() => new Promise<Result<string, AppError>>(() => {}))

      const inflight = cache.getOrFetch('key-a', stalled)
      await new Promise((resolve) => setImmediate(resolve))

      const rejected = await cache.getOrFetch('key-b', vi.fn())

      expect(isErr(rejected)).toBe(true)
      if (isErr(rejected)) expect(rejected.error).toBeInstanceOf(ServiceOverloadError)
      void inflight
    })

    it('frees the slot once the fetch settles', async () => {
      const cache = makeCache({ maxPendingFetches: 1 })

      const first = await cache.getOrFetch('key-a', async () => ok('one'))
      const second = await cache.getOrFetch('key-b', async () => ok('two'))

      expect(isOk(first)).toBe(true)
      expect(isOk(second)).toBe(true)
    })
  })

  describe('the breaker', () => {
    it('stops fetching after repeated retryable failures', async () => {
      const cache = makeCache({ circuitBreaker: BREAKER })
      const failing = vi.fn(async () => err(new TestAppError(FailureMode.RETRYABLE)))

      await cache.getOrFetch('k1', failing)
      await cache.getOrFetch('k2', failing)
      const callsBeforeOpen = failing.mock.calls.length

      const result = await cache.getOrFetch('k3', failing)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(CircuitOpenError)
      expect(failing).toHaveBeenCalledTimes(callsBeforeOpen)
    })

    it('keeps a tripped cache circuit RETRYABLE rather than poisoning the key', async () => {
      const cache = makeCache({ circuitBreaker: BREAKER })
      const failing = vi.fn(async () => err(new TestAppError(FailureMode.RETRYABLE)))

      await cache.getOrFetch('k1', failing)
      await cache.getOrFetch('k2', failing)
      const result = await cache.getOrFetch('k3', failing)

      if (isErr(result)) expect(result.error.failureMode).toBe(FailureMode.RETRYABLE)
      // Nothing about the *input* was learned, so nothing may be negative-cached.
      expect(redis.set).not.toHaveBeenCalled()
    })

    it('does not trip on NOT_FOUND, which is an answer rather than a fault', async () => {
      // A CEP that does not exist says nothing about the pipeline's health.
      const cache = makeCache({ circuitBreaker: BREAKER })
      const missing = vi.fn(async () => err(new TestAppError(FailureMode.NOT_FOUND)))

      await cache.getOrFetch('k1', missing)
      await cache.getOrFetch('k2', missing)
      const result = await cache.getOrFetch('k3', missing)

      expect(missing).toHaveBeenCalledTimes(3)
      if (isErr(result)) expect(result.error).not.toBeInstanceOf(CircuitOpenError)
    })

    it('never opens when no breaker is configured at all', async () => {
      const cache = makeCache()
      const failing = vi.fn(async () => err(new TestAppError(FailureMode.RETRYABLE)))

      await cache.getOrFetch('k1', failing)
      await cache.getOrFetch('k2', failing)
      const result = await cache.getOrFetch('k3', failing)

      expect(failing).toHaveBeenCalledTimes(3)
      if (isErr(result)) expect(result.error).not.toBeInstanceOf(CircuitOpenError)
    })

    it('leaves a successful fetch untouched while the circuit is closed', async () => {
      const cache = makeCache({ circuitBreaker: BREAKER })

      const result = await cache.getOrFetch('k', async () => ok('value'))

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBe('value')
    })
  })
})
