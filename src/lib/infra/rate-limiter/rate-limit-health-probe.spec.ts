import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@env/index', () => ({ env: { REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS: 15_000 } }))

/**
 * The counters and the gauge are `null` whenever METRICS_ENABLED is off, which is
 * the case in tests and in any deployment that has not turned metrics on. Holding
 * them in a mutable box behind getters lets one file cover both worlds: wired
 * instruments, and the null the optional chaining exists for.
 */
const { metricsState } = vi.hoisted(() => ({
  metricsState: {
    up: null as { set: (labels: object, value: number) => void } | null,
    degraded: null as { inc: (labels: object) => void } | null,
    recovered: null as { inc: (labels: object) => void } | null,
  },
}))

vi.mock('@lib/metrics/rate-limiter-metrics', () => ({
  get collectMetricsHttpRateLimitRedisUp() {
    return metricsState.up
  },
  get collectMetricsHttpRateLimitDegraded() {
    return metricsState.degraded
  },
  get collectMetricsHttpRateLimitRecovered() {
    return metricsState.recovered
  },
}))

import { logger } from '@lib/logger'
import { RATE_LIMITER_LOGS } from 'messages/constants/logs/rate-limiter'
import { RateLimitHealthProbe } from './rate-limit-health-probe'

const SUBSYSTEM = { subsystem: 'http-rate-limit' }

function wireMetrics() {
  metricsState.up = { set: vi.fn() }
  metricsState.degraded = { inc: vi.fn() }
  metricsState.recovered = { inc: vi.fn() }

  return metricsState
}

/** A connection that answers PING, or refuses to, on demand. */
function fakeRedis(healthy: () => boolean) {
  return {
    ping: vi.fn(() => (healthy() ? Promise.resolve('PONG') : Promise.reject(new Error('Command timed out')))),
  }
}

describe('RateLimitHealthProbe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    metricsState.up = null
    metricsState.degraded = null
    metricsState.recovered = null
  })

  describe('a single observation', () => {
    it('reports Redis up when PING answers', async () => {
      const metrics = wireMetrics()
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => true) })

      await expect(probe.check()).resolves.toBe(true)

      expect(metrics.up?.set).toHaveBeenCalledWith(SUBSYSTEM, 1)
      expect(probe.degraded).toBe(false)
    })

    it('reports Redis down when PING does not', async () => {
      const metrics = wireMetrics()
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => false) })

      await expect(probe.check()).resolves.toBe(false)

      expect(metrics.up?.set).toHaveBeenCalledWith(SUBSYSTEM, 0)
      expect(probe.degraded).toBe(true)
    })

    it('never rejects, whatever PING throws', async () => {
      const probe = new RateLimitHealthProbe({
        redis: { ping: () => Promise.reject(new Error('boom')) },
      })

      await expect(probe.check()).resolves.toBe(false)
    })

    it('works with metrics switched off, when every instrument is null', async () => {
      // Both transitions, not just the degraded one: the optional chaining is
      // load-bearing on the recovery counter too, and without exercising it a
      // recovery would throw in any deployment with METRICS_ENABLED off.
      let healthy = false
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => healthy) })

      await expect(probe.check()).resolves.toBe(false)
      healthy = true
      await expect(probe.check()).resolves.toBe(true)
      expect(probe.degraded).toBe(false)
    })
  })

  describe('what the operator sees', () => {
    it('says the limit is being skipped, not that it degraded to something else', async () => {
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => false) })

      await probe.check()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining(SUBSYSTEM),
        RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
      )
      expect(RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED).toContain('IGNORADO')
    })

    it('counts every degraded observation', async () => {
      const metrics = wireMetrics()
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => false) })

      await probe.check()
      await probe.check()
      await probe.check()

      expect(metrics.degraded?.inc).toHaveBeenCalledTimes(3)
      expect(metrics.degraded?.inc).toHaveBeenCalledWith(SUBSYSTEM)
    })

    it('does not repeat the warning on every observation of the same outage', async () => {
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => false) })

      await probe.check()
      await probe.check()
      await probe.check()

      expect(logger.warn).toHaveBeenCalledOnce()
    })

    it('reports the recovery once, and resumes reporting Redis up', async () => {
      const metrics = wireMetrics()
      let healthy = false
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => healthy) })

      await probe.check()
      healthy = true
      await probe.check()
      await probe.check()

      expect(metrics.recovered?.inc).toHaveBeenCalledOnce()
      expect(metrics.recovered?.inc).toHaveBeenCalledWith(SUBSYSTEM)
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining(SUBSYSTEM),
        RATE_LIMITER_LOGS.HTTP_INFRA_RECOVERED,
      )
      expect(probe.degraded).toBe(false)
    })

    it('says nothing at all while Redis is healthy', async () => {
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => true) })

      await probe.check()
      await probe.check()

      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.info).not.toHaveBeenCalled()
    })
  })

  describe('the schedule', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('probes immediately, so the gauge has a value before the first scrape', async () => {
      const redis = fakeRedis(() => true)
      const probe = new RateLimitHealthProbe({ redis, intervalMs: 15_000 })

      probe.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(redis.ping).toHaveBeenCalledOnce()
      probe.stop()
    })

    it('probes once per interval after that', async () => {
      const redis = fakeRedis(() => true)
      const probe = new RateLimitHealthProbe({ redis, intervalMs: 15_000 })

      probe.start()
      await vi.advanceTimersByTimeAsync(45_000)

      expect(redis.ping).toHaveBeenCalledTimes(4)
      probe.stop()
    })

    it('uses the configured interval rather than a hardcoded one', async () => {
      const redis = fakeRedis(() => true)
      const probe = new RateLimitHealthProbe({ redis, intervalMs: 60_000 })

      probe.start()
      await vi.advanceTimersByTimeAsync(45_000)

      expect(redis.ping).toHaveBeenCalledOnce()
      probe.stop()
    })

    it('falls back to the env interval when none is given', async () => {
      const redis = fakeRedis(() => true)
      const probe = new RateLimitHealthProbe({ redis })

      probe.start()
      await vi.advanceTimersByTimeAsync(15_000)

      expect(redis.ping).toHaveBeenCalledTimes(2)
      probe.stop()
    })

    it('stops probing once stopped — no timer outliving the app', async () => {
      const redis = fakeRedis(() => true)
      const probe = new RateLimitHealthProbe({ redis, intervalMs: 15_000 })

      probe.start()
      await vi.advanceTimersByTimeAsync(15_000)
      probe.stop()
      await vi.advanceTimersByTimeAsync(60_000)

      expect(redis.ping).toHaveBeenCalledTimes(2)
    })

    it('does not start a second timer when started twice', async () => {
      const redis = fakeRedis(() => true)
      const probe = new RateLimitHealthProbe({ redis, intervalMs: 15_000 })

      probe.start()
      probe.start()
      await vi.advanceTimersByTimeAsync(15_000)

      expect(redis.ping).toHaveBeenCalledTimes(2)
      probe.stop()
    })

    it('tolerates being stopped when it never started', () => {
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => true), intervalMs: 15_000 })

      expect(() => probe.stop()).not.toThrow()
    })

    it('does not hold the process open', () => {
      const probe = new RateLimitHealthProbe({ redis: fakeRedis(() => true), intervalMs: 15_000 })
      const unref = vi.spyOn(globalThis, 'setInterval')

      probe.start()

      const timer = unref.mock.results[0]?.value as NodeJS.Timeout
      expect(timer.hasRef()).toBe(false)

      probe.stop()
      unref.mockRestore()
    })

    it('forgets an open episode on stop, so a restart still announces the outage', async () => {
      const redis = fakeRedis(() => false)
      const probe = new RateLimitHealthProbe({ redis, intervalMs: 15_000 })

      probe.start()
      await vi.advanceTimersByTimeAsync(0)
      probe.stop()
      vi.clearAllMocks()

      probe.start()
      await vi.advanceTimersByTimeAsync(0)
      probe.stop()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining(SUBSYSTEM),
        RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
      )
    })
  })
})
