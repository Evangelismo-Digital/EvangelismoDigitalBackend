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

// 3. Mock the Redis cache client used by DistributedLock
const mockRedisSet = vi.fn()
const mockRedisEval = vi.fn()

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisCache: () => ({
    set: mockRedisSet,
    eval: mockRedisEval,
  }),
}))

import type { Metric } from 'prom-client'
import { DistributedLock } from './distributed-lock'
import { getRegistry } from '@lib/metrics'
import {
  lockAcquired,
  lockContention,
  lockReleased,
  lockExpired,
  lockErrors,
  lockDuration,
} from '@lib/metrics/lock-metrics'

const KEY = 'lock:outbox-processor'

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

describe('DistributedLock metrics instrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRegistry()?.resetMetrics()
  })

  describe('acquire', () => {
    it('counts an acquisition and returns a token on success', async () => {
      mockRedisSet.mockResolvedValue('OK')

      const token = await DistributedLock.acquire(KEY, 10_000)

      expect(typeof token).toBe('string')
      expect(await metricValue(lockAcquired, { key: KEY })).toBe(1)
      expect(await metricValue(lockContention, { key: KEY })).toBe(0)
    })

    it('counts contention and returns null when the lock is held', async () => {
      mockRedisSet.mockResolvedValue(null)

      const token = await DistributedLock.acquire(KEY, 10_000)

      expect(token).toBeNull()
      expect(await metricValue(lockContention, { key: KEY })).toBe(1)
      expect(await metricValue(lockAcquired, { key: KEY })).toBe(0)
    })

    it('counts a lock error (operation=acquire) and returns null on Redis failure', async () => {
      mockRedisSet.mockRejectedValue(new Error('redis down'))

      const token = await DistributedLock.acquire(KEY, 10_000)

      expect(token).toBeNull()
      expect(await metricValue(lockErrors, { operation: 'acquire' })).toBe(1)
      expect(await metricValue(lockContention, { key: KEY })).toBe(0)
    })
  })

  describe('renew', () => {
    it('returns true and records no expiry on success', async () => {
      mockRedisEval.mockResolvedValue(1)

      const renewed = await DistributedLock.renew(KEY, 'token', 10_000)

      expect(renewed).toBe(true)
      expect(await metricValue(lockExpired, { key: KEY })).toBe(0)
    })

    it('counts an expiry and returns false when the lock is no longer owned', async () => {
      mockRedisEval.mockResolvedValue(0)

      const renewed = await DistributedLock.renew(KEY, 'token', 10_000)

      expect(renewed).toBe(false)
      expect(await metricValue(lockExpired, { key: KEY })).toBe(1)
    })

    it('counts a lock error (operation=renew) and returns false on Redis failure', async () => {
      mockRedisEval.mockRejectedValue(new Error('redis down'))

      const renewed = await DistributedLock.renew(KEY, 'token', 10_000)

      expect(renewed).toBe(false)
      expect(await metricValue(lockErrors, { operation: 'renew' })).toBe(1)
      expect(await metricValue(lockExpired, { key: KEY })).toBe(0)
    })
  })

  describe('release', () => {
    it('counts a release when the lock was still owned', async () => {
      mockRedisEval.mockResolvedValue(1)

      await DistributedLock.release(KEY, 'token')

      expect(await metricValue(lockReleased, { key: KEY })).toBe(1)
      expect(await metricValue(lockExpired, { key: KEY })).toBe(0)
    })

    it('counts an expiry when the lock had already expired', async () => {
      mockRedisEval.mockResolvedValue(0)

      await DistributedLock.release(KEY, 'token')

      expect(await metricValue(lockExpired, { key: KEY })).toBe(1)
      expect(await metricValue(lockReleased, { key: KEY })).toBe(0)
    })

    it('counts a lock error (operation=release) on Redis failure', async () => {
      mockRedisEval.mockRejectedValue(new Error('redis down'))

      await DistributedLock.release(KEY, 'token')

      expect(await metricValue(lockErrors, { operation: 'release' })).toBe(1)
    })
  })

  describe('hold duration', () => {
    it('observes distributed_lock_duration_seconds across an acquire/release cycle', async () => {
      mockRedisSet.mockResolvedValue('OK')
      mockRedisEval.mockResolvedValue(1)

      const token = await DistributedLock.acquire(KEY, 10_000)
      await DistributedLock.release(KEY, token as string)

      expect(await metricValue(lockDuration, { key: KEY }, '_count')).toBe(1)
    })

    it('does not observe duration when release has no matching acquire token', async () => {
      mockRedisEval.mockResolvedValue(1)

      await DistributedLock.release(KEY, 'never-acquired')

      expect(await metricValue(lockDuration, { key: KEY }, '_count')).toBe(0)
    })
  })
})
