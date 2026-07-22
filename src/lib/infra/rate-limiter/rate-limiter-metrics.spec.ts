import { vi, describe, it, expect, beforeEach } from 'vitest'

// 1. Habilita métricas: o registry lê env de '@env/index'
vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
  },
}))

// 2. Mock do env consumido indiretamente por outros módulos
vi.mock('@lib/env', () => ({
  env: {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
  },
}))

// 3. Mock do logger
vi.mock('@lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

// 4. Mock do IORedis
const mockRedisQuit = vi.fn().mockResolvedValue('OK')
vi.mock('ioredis', () => {
  const RedisMock = vi.fn().mockImplementation(function () {
    return {
      quit: mockRedisQuit,
    }
  })
  return {
    default: RedisMock,
    Redis: RedisMock,
  }
})

// 5. Mock do rate-limiter-flexible (controla o desfecho de consume)
const mockConsume = vi.fn()
vi.mock('rate-limiter-flexible', () => {
  return {
    RateLimiterRedis: vi.fn().mockImplementation(function () {
      return {
        consume: mockConsume,
      }
    }),
  }
})

// Imports reais após mocks
import Redis from 'ioredis'
import type { Metric } from 'prom-client'
import { RedisRateLimiter, EnumProviderConfig } from './redis-rate-limiter'
import { getRegistry } from '@lib/metrics'
import {
  collectMetricsRateLimiterConsumed,
  collectMetricsRateLimiterRejected,
  collectMetricsRateLimiterInfraDegraded,
  collectMetricsRateLimiterInfraRecovered,
} from '@lib/metrics/rate-limiter-metrics'

const PROVIDER = EnumProviderConfig.AWESOME_API_ADDRESS

async function metricValue(metric: Metric | null, labels: Record<string, string>): Promise<number> {
  if (!metric) return 0
  const data = await (
    metric as unknown as {
      get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>
    }
  ).get()
  const match = data.values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))
  return match?.value ?? 0
}

describe('RedisRateLimiter metrics instrumentation', () => {
  let redisClient: Redis

  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry()?.resetMetrics()

    // Reset do Singleton e do estado estático de outage (hack de props privadas)
    ;(RedisRateLimiter as unknown as { instance: unknown }).instance = undefined
    ;(RedisRateLimiter as unknown as { infraOutageStartedAt: number | null }).infraOutageStartedAt = null
    ;(RedisRateLimiter as unknown as { infraLastWarnAt: number }).infraLastWarnAt = 0
    ;(RedisRateLimiter as unknown as { infraSuppressedLogs: number }).infraSuppressedLogs = 0

    redisClient = new Redis()
  })

  it('counts a consumed point when consume succeeds', async () => {
    mockConsume.mockResolvedValue({})
    const limiter = RedisRateLimiter.getInstance(redisClient)

    const allowed = await limiter.tryConsume(PROVIDER)

    expect(allowed).toBe(true)
    expect(await metricValue(collectMetricsRateLimiterConsumed, { provider: PROVIDER })).toBe(1)
    expect(await metricValue(collectMetricsRateLimiterRejected, { provider: PROVIDER })).toBe(0)
  })

  it('counts a rejection when the rate limit is exceeded', async () => {
    mockConsume.mockRejectedValue({ remainingPoints: 0 })
    const limiter = RedisRateLimiter.getInstance(redisClient)

    const allowed = await limiter.tryConsume(PROVIDER)

    expect(allowed).toBe(false)
    expect(await metricValue(collectMetricsRateLimiterRejected, { provider: PROVIDER })).toBe(1)
    expect(await metricValue(collectMetricsRateLimiterConsumed, { provider: PROVIDER })).toBe(0)
  })

  it('counts a fail-open (degraded) event on Redis failure and allows traffic', async () => {
    mockConsume.mockRejectedValue(new Error('redis connection refused'))
    const limiter = RedisRateLimiter.getInstance(redisClient)

    const allowed = await limiter.tryConsume(PROVIDER)

    expect(allowed).toBe(true)
    expect(await metricValue(collectMetricsRateLimiterInfraDegraded, { provider: PROVIDER })).toBe(1)
    expect(await metricValue(collectMetricsRateLimiterConsumed, { provider: PROVIDER })).toBe(0)
  })

  it('counts every fail-open request while Redis stays down', async () => {
    mockConsume.mockRejectedValue(new Error('redis down'))
    const limiter = RedisRateLimiter.getInstance(redisClient)

    await limiter.tryConsume(PROVIDER)
    await limiter.tryConsume(PROVIDER)
    await limiter.tryConsume(PROVIDER)

    expect(await metricValue(collectMetricsRateLimiterInfraDegraded, { provider: PROVIDER })).toBe(3)
  })

  it('counts a single recovery when Redis comes back after an outage', async () => {
    const limiter = RedisRateLimiter.getInstance(redisClient)

    mockConsume.mockRejectedValueOnce(new Error('redis down'))
    await limiter.tryConsume(PROVIDER)

    mockConsume.mockResolvedValue({})
    await limiter.tryConsume(PROVIDER)
    await limiter.tryConsume(PROVIDER)

    expect(await metricValue(collectMetricsRateLimiterInfraRecovered, { provider: PROVIDER })).toBe(1)
  })
})
