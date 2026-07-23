import { vi, describe, it, expect, beforeEach } from 'vitest'

// 1. Enable metrics: the registry reads env from '@env/index'
vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
  },
}))

// 2. Mock logger
vi.mock('@lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  },
}))

// 3. Mock IORedis
const mockRedisGet = vi.fn()
const mockRedisSet = vi.fn()

vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    return {
      get: mockRedisGet,
      set: mockRedisSet,
      del: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
    }
  })

  return { default: RedisMock, Redis: RedisMock }
})

import Redis from 'ioredis'
import type { Metric } from 'prom-client'
import { ResilientCache } from './resilient-cache'
import { ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { getRegistry } from '@lib/metrics'
import {
  collectMetricsCacheHits,
  collectMetricsCacheMisses,
  collectMetricsCacheErrors,
  collectMetricsCachePendingFetches,
  collectMetricsCacheFetchDuration,
  collectMetricsCacheCircuitBreakerTrips,
} from '@lib/metrics/cache-metrics'

const PREFIX = 'test-cache:'

const baseOptions = {
  prefix: PREFIX,
  defaultTtlSeconds: 60,
  negativeTtlSeconds: 10,
  fetchTimeoutMs: 5_000,
  maxPendingFetches: 5,
  ttlJitterPercentage: 0,
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

async function metricValue(metric: Metric | null, labels: Record<string, string>, suffix?: string): Promise<number> {
  if (!metric) return 0
  const data = await (
    metric as unknown as {
      get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string>; metricName?: string }> }>
    }
  ).get()
  const match = data.values.find(
    (v) =>
      (suffix ? v.metricName?.endsWith(suffix) : true) &&
      Object.entries(labels).every(([k, val]) => v.labels[k] === val),
  )
  return match?.value ?? 0
}

describe('ResilientCache metrics instrumentation', () => {
  let redisClient: Redis
  let cache: ResilientCache<AppError>

  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry()?.resetMetrics()
    mockRedisSet.mockResolvedValue('OK')
    redisClient = new Redis()
    cache = new ResilientCache<AppError>(redisClient, baseOptions)
  })

  it('counts a hit on a stored success envelope and skips the fetcher', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ s: true, v: 'cached-value' }))
    const fetcher = vi.fn()

    const result = await cache.getOrFetch('k', fetcher)

    expect(result).toEqual(ok('cached-value'))
    expect(fetcher).not.toHaveBeenCalled()
    expect(await metricValue(collectMetricsCacheHits, { prefix: PREFIX })).toBe(1)
    expect(await metricValue(collectMetricsCacheMisses, { prefix: PREFIX })).toBe(0)
  })

  it('counts a hit on a stored cached-failure envelope', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ s: false, e: { type: 'TestAppError', message: 'boom' } }))
    const fetcher = vi.fn()

    const result = await cache.getOrFetch('k', fetcher)

    expect(isErr(result)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await metricValue(collectMetricsCacheHits, { prefix: PREFIX })).toBe(1)
  })

  it('counts a miss and observes fetcher duration when the fetcher runs', async () => {
    mockRedisGet.mockResolvedValue(null)
    const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

    const result = await cache.getOrFetch('k', fetcher)

    expect(result).toEqual(ok('fresh'))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await metricValue(collectMetricsCacheMisses, { prefix: PREFIX })).toBe(1)
    expect(await metricValue(collectMetricsCacheHits, { prefix: PREFIX })).toBe(0)
    expect(await metricValue(collectMetricsCacheFetchDuration, { prefix: PREFIX }, '_count')).toBe(1)
  })

  it('tags a Redis read failure as error_type=read and falls through to fetch', async () => {
    mockRedisGet.mockRejectedValue(new Error('connection refused'))
    const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

    const result = await cache.getOrFetch('k', fetcher)

    expect(result).toEqual(ok('fresh'))
    expect(await metricValue(collectMetricsCacheErrors, { prefix: PREFIX, error_type: 'read' })).toBe(1)
    expect(await metricValue(collectMetricsCacheMisses, { prefix: PREFIX })).toBe(1)
  })

  it('tags an unparseable payload as error_type=corrupted and falls through to fetch', async () => {
    mockRedisGet.mockResolvedValue('not-json{')
    const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

    const result = await cache.getOrFetch('k', fetcher)

    expect(result).toEqual(ok('fresh'))
    expect(await metricValue(collectMetricsCacheErrors, { prefix: PREFIX, error_type: 'corrupted' })).toBe(1)
    expect(await metricValue(collectMetricsCacheMisses, { prefix: PREFIX })).toBe(1)
  })

  it('tags a success envelope missing its value as error_type=corrupted without fetching', async () => {
    mockRedisGet.mockResolvedValue(JSON.stringify({ s: true }))
    const fetcher = vi.fn()

    const result = await cache.getOrFetch('k', fetcher)

    expect(isErr(result)).toBe(true)
    expect(fetcher).not.toHaveBeenCalled()
    expect(await metricValue(collectMetricsCacheErrors, { prefix: PREFIX, error_type: 'corrupted' })).toBe(1)
    expect(await metricValue(collectMetricsCacheHits, { prefix: PREFIX })).toBe(0)
  })

  it('tags a Redis write failure as error_type=write while still returning the value', async () => {
    mockRedisGet.mockResolvedValue(null)
    mockRedisSet.mockRejectedValue(new Error('write failed'))
    const fetcher = vi.fn().mockResolvedValue(ok('fresh'))

    const result = await cache.getOrFetch('k', fetcher)

    expect(result).toEqual(ok('fresh'))
    expect(await metricValue(collectMetricsCacheErrors, { prefix: PREFIX, error_type: 'write' })).toBe(1)
  })

  it('raises the pending-fetches gauge during an in-flight fetch and clears it after settle', async () => {
    mockRedisGet.mockResolvedValue(null)
    let resolveFetch!: (value: ReturnType<typeof ok<string>>) => void
    const fetcher = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)))

    const pending = cache.getOrFetch('k', fetcher as never)
    await flush()

    expect(await metricValue(collectMetricsCachePendingFetches, { prefix: PREFIX })).toBe(1)

    resolveFetch(ok('fresh'))
    await pending

    expect(await metricValue(collectMetricsCachePendingFetches, { prefix: PREFIX })).toBe(0)
  })

  it('counts a circuit-breaker trip when pending fetches reach the cap', async () => {
    mockRedisGet.mockResolvedValue(null)
    const cappedCache = new ResilientCache<AppError>(redisClient, { ...baseOptions, maxPendingFetches: 1 })

    let resolveFetch!: (value: ReturnType<typeof ok<string>>) => void
    const blockingFetcher = vi.fn(() => new Promise((resolve) => (resolveFetch = resolve)))

    const first = cappedCache.getOrFetch('k1', blockingFetcher as never)
    await flush()

    const tripped = await cappedCache.getOrFetch('k2', vi.fn().mockResolvedValue(ok('x')))

    expect(isErr(tripped)).toBe(true)
    expect(await metricValue(collectMetricsCacheCircuitBreakerTrips, { prefix: PREFIX })).toBe(1)

    resolveFetch(ok('fresh'))
    await first
  })
})
