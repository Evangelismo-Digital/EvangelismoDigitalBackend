import { vi, describe, it, expect, beforeEach, afterAll } from 'vitest'

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
import { logger } from '@lib/logger'
import { LOCK_LOGS } from 'messages/constants/logs/distributed-lock'
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
const TTL_MS = 10_000
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

describe('DistributedLock behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('acquire', () => {
    it('stores a fresh UUID token via SET with PX and NX and returns it', async () => {
      mockRedisSet.mockResolvedValue('OK')

      const token = await DistributedLock.acquire(KEY, TTL_MS)

      expect(mockRedisSet).toHaveBeenCalledTimes(1)
      expect(mockRedisSet).toHaveBeenCalledWith(KEY, expect.any(String), 'PX', TTL_MS, 'NX')
      // The value written to Redis is exactly the token returned to the caller.
      const writtenToken = mockRedisSet.mock.calls[0][1]
      expect(writtenToken).toBe(token)
      expect(token).toMatch(UUID_V4)
    })

    it('generates a distinct token on each acquisition', async () => {
      mockRedisSet.mockResolvedValue('OK')

      const first = await DistributedLock.acquire(KEY, TTL_MS)
      const second = await DistributedLock.acquire(KEY, TTL_MS)

      expect(first).not.toBe(second)
      expect(mockRedisSet.mock.calls[0][1]).not.toBe(mockRedisSet.mock.calls[1][1])
    })

    it('returns null without logging when the lock is already held (SET not OK)', async () => {
      mockRedisSet.mockResolvedValue(null)

      const token = await DistributedLock.acquire(KEY, TTL_MS)

      expect(token).toBeNull()
      expect(logger.error).not.toHaveBeenCalled()
    })

    it('returns null and logs ACQUIRE_FAILED without throwing when Redis rejects', async () => {
      const error = new Error('redis down')
      mockRedisSet.mockRejectedValue(error)

      const token = await DistributedLock.acquire(KEY, TTL_MS)

      expect(token).toBeNull()
      expect(logger.error).toHaveBeenCalledWith({ error, key: KEY }, LOCK_LOGS.ACQUIRE_FAILED)
    })
  })

  describe('renew', () => {
    it('evaluates the renew script (pexpire) with numKeys 1 and a stringified TTL', async () => {
      mockRedisEval.mockResolvedValue(1)

      await DistributedLock.renew(KEY, 'token-123', TTL_MS)

      expect(mockRedisEval).toHaveBeenCalledTimes(1)
      const [script, numKeys, key, token, ttlArg] = mockRedisEval.mock.calls[0]
      expect(script).toContain('pexpire')
      expect(numKeys).toBe(1)
      expect(key).toBe(KEY)
      expect(token).toBe('token-123')
      expect(ttlArg).toBe('10000')
      expect(typeof ttlArg).toBe('string')
    })

    it('returns true and does not warn when the lock is still owned (eval → 1)', async () => {
      mockRedisEval.mockResolvedValue(1)

      const renewed = await DistributedLock.renew(KEY, 'token', TTL_MS)

      expect(renewed).toBe(true)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('returns false and warns RENEW_EXPIRED when the lock was lost (eval → 0)', async () => {
      mockRedisEval.mockResolvedValue(0)

      const renewed = await DistributedLock.renew(KEY, 'token', TTL_MS)

      expect(renewed).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith({ key: KEY }, LOCK_LOGS.RENEW_EXPIRED)
    })

    it('treats any non-1 eval result as not-renewed (edge: null)', async () => {
      mockRedisEval.mockResolvedValue(null)

      const renewed = await DistributedLock.renew(KEY, 'token', TTL_MS)

      expect(renewed).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith({ key: KEY }, LOCK_LOGS.RENEW_EXPIRED)
    })

    it('returns false and logs RENEW_FAILED without throwing when Redis rejects', async () => {
      const error = new Error('redis down')
      mockRedisEval.mockRejectedValue(error)

      const renewed = await DistributedLock.renew(KEY, 'token', TTL_MS)

      expect(renewed).toBe(false)
      expect(logger.error).toHaveBeenCalledWith({ error, key: KEY }, LOCK_LOGS.RENEW_FAILED)
    })
  })

  describe('release', () => {
    it('evaluates the release script (del, not pexpire) with numKeys 1', async () => {
      mockRedisEval.mockResolvedValue(1)

      await DistributedLock.release(KEY, 'token-123')

      expect(mockRedisEval).toHaveBeenCalledTimes(1)
      const [script, numKeys, key, token] = mockRedisEval.mock.calls[0]
      expect(script).toContain('del')
      expect(script).not.toContain('pexpire')
      expect(numKeys).toBe(1)
      expect(key).toBe(KEY)
      expect(token).toBe('token-123')
    })

    it('resolves cleanly without warning when the lock was still owned (eval → 1)', async () => {
      mockRedisEval.mockResolvedValue(1)

      await expect(DistributedLock.release(KEY, 'token')).resolves.toBeUndefined()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('warns RELEASE_EXPIRED when the lock had already expired (eval → 0)', async () => {
      mockRedisEval.mockResolvedValue(0)

      await DistributedLock.release(KEY, 'token')

      expect(logger.warn).toHaveBeenCalledWith({ key: KEY }, LOCK_LOGS.RELEASE_EXPIRED)
    })

    it('swallows Redis errors, logs RELEASE_FAILED, and never throws', async () => {
      const error = new Error('redis down')
      mockRedisEval.mockRejectedValue(error)

      await expect(DistributedLock.release(KEY, 'token')).resolves.toBeUndefined()
      expect(logger.warn).toHaveBeenCalledWith({ error, key: KEY }, LOCK_LOGS.RELEASE_FAILED)
    })
  })

  describe('lock lifecycle (outbox usage patterns)', () => {
    it('threads the same token through acquire → renew → release on the happy path', async () => {
      mockRedisSet.mockResolvedValue('OK')
      mockRedisEval.mockResolvedValue(1)

      const token = await DistributedLock.acquire(KEY, TTL_MS)
      const renewed = await DistributedLock.renew(KEY, token as string, TTL_MS)
      await DistributedLock.release(KEY, token as string)

      expect(renewed).toBe(true)
      expect(mockRedisSet).toHaveBeenCalledTimes(1)
      expect(mockRedisEval).toHaveBeenCalledTimes(2)
      // renew then release, both carrying the acquired token
      expect(mockRedisEval.mock.calls[0][0]).toContain('pexpire')
      expect(mockRedisEval.mock.calls[0][3]).toBe(token)
      expect(mockRedisEval.mock.calls[1][0]).toContain('del')
      expect(mockRedisEval.mock.calls[1][3]).toBe(token)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('yields no token under contention and the caller performs no eval', async () => {
      mockRedisSet.mockResolvedValue(null)

      const token = await DistributedLock.acquire(KEY, TTL_MS)

      expect(token).toBeNull()
      expect(mockRedisEval).not.toHaveBeenCalled()
    })

    it('handles a lock lost mid-run: renew → 0 then release → 0 both report expiry', async () => {
      mockRedisSet.mockResolvedValue('OK')
      mockRedisEval.mockResolvedValueOnce(0).mockResolvedValueOnce(0)

      const token = await DistributedLock.acquire(KEY, TTL_MS)
      const renewed = await DistributedLock.renew(KEY, token as string, TTL_MS)
      await DistributedLock.release(KEY, token as string)

      expect(renewed).toBe(false)
      expect(logger.warn).toHaveBeenCalledWith({ key: KEY }, LOCK_LOGS.RENEW_EXPIRED)
      expect(logger.warn).toHaveBeenCalledWith({ key: KEY }, LOCK_LOGS.RELEASE_EXPIRED)
    })

    it('produces a new distinct token when re-acquiring after release', async () => {
      mockRedisSet.mockResolvedValue('OK')
      mockRedisEval.mockResolvedValue(1)

      const first = await DistributedLock.acquire(KEY, TTL_MS)
      await DistributedLock.release(KEY, first as string)
      const second = await DistributedLock.acquire(KEY, TTL_MS)

      expect(first).not.toBe(second)
    })
  })
})

describe('DistributedLock without metrics (METRICS_ENABLED=false)', () => {
  afterAll(() => {
    vi.doUnmock('@env/index')
    vi.resetModules()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    vi.doMock('@env/index', () => ({ env: { METRICS_ENABLED: false } }))
  })

  it('exposes null metric handles when metrics are disabled', async () => {
    const lockMetrics = await import('../../metrics/lock-metrics.js')

    expect(lockMetrics.lockAcquired).toBeNull()
    expect(lockMetrics.lockDuration).toBeNull()
    expect(lockMetrics.lockErrors).toBeNull()
  })

  it('acquires, renews, and releases correctly with metrics off (null-guards inert)', async () => {
    const { DistributedLock: Lock } = await import('./distributed-lock.js')

    mockRedisSet.mockResolvedValue('OK')
    mockRedisEval.mockResolvedValueOnce(1).mockResolvedValueOnce(1)

    const token = await Lock.acquire(KEY, TTL_MS)
    const renewed = await Lock.renew(KEY, token as string, TTL_MS)

    await expect(Lock.release(KEY, token as string)).resolves.toBeUndefined()
    expect(token).toMatch(UUID_V4)
    expect(renewed).toBe(true)
  })

  it('still returns null on contention and false on lost renew with metrics off', async () => {
    const { DistributedLock: Lock } = await import('./distributed-lock.js')

    mockRedisSet.mockResolvedValue(null)
    mockRedisEval.mockResolvedValue(0)

    expect(await Lock.acquire(KEY, TTL_MS)).toBeNull()
    expect(await Lock.renew(KEY, 'token', TTL_MS)).toBe(false)
  })
})
