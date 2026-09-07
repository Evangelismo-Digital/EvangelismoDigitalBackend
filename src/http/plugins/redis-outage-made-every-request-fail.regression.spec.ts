import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

/**
 * Regression: **a Redis hiccup returned HTTP 500 for every request.**
 *
 * The HTTP limiter ran with `skipOnError: false`, so any failure of its Redis
 * store became the request's failure. The rate-limiter connection is configured
 * to fail fast on purpose — 100 ms `commandTimeout`, `enableOfflineQueue: false`,
 * `maxRetriesPerRequest: 0` (see `redis-rate-limiter-connection.ts`) — so a merely
 * *slow* Redis, not even a dead one, was enough: `RedisStore.incr` rejected with
 * "Stream isn't writeable and enableOfflineQueue options is false" and the caller
 * got a 500 from the component whose entire job is protecting the service.
 *
 * Observed in CI on 2026-09-07: `analytics.e2e.spec.ts` returned 500 instead of
 * 201 while Redis was under load from parallel test projects. The request never
 * reached its controller.
 *
 * The fix is `skipOnError: true`: Redis stays the single source of truth, and when
 * it cannot answer the limit is skipped rather than turned into an outage. That
 * trade is only acceptable while the skipping is visible, so the counterweight
 * here is observability, not a second limiter — the health probe must publish the
 * degraded state for Prometheus/Grafana/Alertmanager. A silent skip would be the
 * same defect wearing a 200.
 */

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@env/index', () => ({
  env: {
    REDIS_RATE_LIMIT_HEALTH_INTERVAL_MS: 15_000,
    HTTP_RATE_LIMIT_GLOBAL_MAX: 300,
    HTTP_RATE_LIMIT_GLOBAL_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_AUTH_SESSION_MAX: 5,
    HTTP_RATE_LIMIT_AUTH_SESSION_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_AUTH_REGISTER_MAX: 5,
    HTTP_RATE_LIMIT_AUTH_REGISTER_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_MAX: 5,
    HTTP_RATE_LIMIT_AUTH_FORGOT_PASSWORD_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_MAX: 5,
    HTTP_RATE_LIMIT_AUTH_RESET_PASSWORD_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_USERS_LIST_MAX: 5,
    HTTP_RATE_LIMIT_USERS_LIST_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_USERS_DELETE_MAX: 5,
    HTTP_RATE_LIMIT_USERS_DELETE_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_CHURCHES_NEAREST_MAX: 5,
    HTTP_RATE_LIMIT_CHURCHES_NEAREST_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_FORMS_SUBMIT_MAX: 5,
    HTTP_RATE_LIMIT_FORMS_SUBMIT_TIME_WINDOW: '1 minute',
    HTTP_RATE_LIMIT_HEALTH_CHECK_MAX: 5,
    HTTP_RATE_LIMIT_HEALTH_CHECK_TIME_WINDOW: '1 minute',
  },
}))

const { metricsState } = vi.hoisted(() => ({
  metricsState: {
    up: { set: vi.fn() },
    degraded: { inc: vi.fn() },
    recovered: { inc: vi.fn() },
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

const { mockGetRedisRateLimit, redis } = vi.hoisted(() => {
  const redis = {
    failing: false,
    /** Counts per rate-limit key, standing in for what Redis would hold. */
    counters: new Map<string, number>(),
    outage: () => new Error("Stream isn't writeable and enableOfflineQueue options is false"),
  }

  /**
   * Reproduces the two things the plugin's built-in Redis store uses: the custom
   * `rateLimit` command it installs with `defineCommand`, answered through a
   * trailing callback, and `ping` for the health probe.
   */
  const client: Record<string, unknown> = {
    ping: () => (redis.failing ? Promise.reject(redis.outage()) : Promise.resolve('PONG')),
    defineCommand: (name: string) => {
      client[name] = (...args: unknown[]) => {
        const callback = args.at(-1) as (error: Error | null, result?: [number, number]) => void
        const key = String(args[0])
        const timeWindow = Number(args[1])

        if (redis.failing) {
          callback(redis.outage())
          return
        }

        const current = (redis.counters.get(key) ?? 0) + 1
        redis.counters.set(key, current)

        callback(null, [current, timeWindow])
      }
    },
  }

  return { mockGetRedisRateLimit: () => client, redis }
})

vi.mock('@lib/redis/clients/clients', () => ({ getRedisRateLimit: mockGetRedisRateLimit }))

import { httpRateLimit } from './rate-limit.plugin'
import { RATE_LIMITER_LOGS } from 'messages/constants/logs/rate-limiter'
import { logger } from '@lib/logger'

const CALLER_IP = '203.0.113.10'
const MAX = 2

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()

  await app.register(httpRateLimit)

  app.get('/probe', { config: { rateLimit: { max: MAX, timeWindow: 60_000 } } }, async () => ({ ok: true }))

  await app.ready()

  return app
}

async function get(app: FastifyInstance) {
  return app.inject({ method: 'GET', url: '/probe', remoteAddress: CALLER_IP })
}

/** The probe fires once on registration; wait for that observation to land. */
async function firstProbe() {
  await vi.waitFor(() => expect(metricsState.up.set).toHaveBeenCalled())
}

describe('regression: a Redis outage must not take the API down with it', () => {
  let app: FastifyInstance

  beforeEach(() => {
    vi.clearAllMocks()
    redis.failing = false
    redis.counters.clear()
  })

  afterEach(async () => {
    await app?.close()
  })

  describe('Redis healthy — the limit is enforced from Redis', () => {
    it('serves a request under the limit', async () => {
      app = await buildApp()

      const response = await get(app)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('rejects a request over the limit with 429', async () => {
      app = await buildApp()

      await get(app)
      await get(app)

      expect((await get(app)).statusCode).toBe(429)
    })

    it('counts in Redis, and nowhere else', async () => {
      app = await buildApp()

      await get(app)
      await get(app)

      expect([...redis.counters.values()]).toEqual([2])
    })

    it('publishes Redis as up', async () => {
      app = await buildApp()
      await firstProbe()

      expect(metricsState.up.set).toHaveBeenCalledWith({ subsystem: 'http-rate-limit' }, 1)
      expect(metricsState.degraded.inc).not.toHaveBeenCalled()
    })
  })

  describe('Redis unavailable — the limit is skipped, the request is not', () => {
    beforeEach(() => {
      redis.failing = true
    })

    it('does NOT return 500 — the defect this regression exists for', async () => {
      app = await buildApp()

      const response = await get(app)

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({ ok: true })
    })

    it('skips the rate limit rather than enforcing it, as intended', async () => {
      app = await buildApp()

      const statuses: number[] = []
      for (let i = 0; i < MAX + 3; i += 1) {
        statuses.push((await get(app)).statusCode)
      }

      // Deliberately fail-open: every request is served, none is counted.
      expect(statuses).toEqual([200, 200, 200, 200, 200])
      expect(redis.counters.size).toBe(0)
    })

    it('emits the degradation metric, so the skip is never silent', async () => {
      app = await buildApp()
      await firstProbe()

      expect(metricsState.up.set).toHaveBeenCalledWith({ subsystem: 'http-rate-limit' }, 0)
      expect(metricsState.degraded.inc).toHaveBeenCalledWith({ subsystem: 'http-rate-limit' })
    })

    it('says in the log that the limit is being skipped', async () => {
      app = await buildApp()
      await firstProbe()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ subsystem: 'http-rate-limit' }),
        RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
      )
    })

    it('keeps the metrics answering while the outage continues', async () => {
      app = await buildApp()
      await firstProbe()

      const probe = metricsState.up.set.mock.calls.length
      await get(app)
      await get(app)

      // Request traffic never breaks the instrument: it is published by the probe,
      // off the request path, so it survives exactly the outage it reports on.
      expect(metricsState.up.set).toHaveBeenCalledTimes(probe)
      expect(metricsState.up.set).toHaveBeenLastCalledWith({ subsystem: 'http-rate-limit' }, 0)
    })
  })

  describe('Redis recovery — enforcement resumes', () => {
    it('enforces the limit again once Redis answers', async () => {
      redis.failing = true
      app = await buildApp()

      await get(app)
      await get(app)
      await get(app)
      redis.failing = false

      // Nothing was counted during the outage, so the window starts here.
      expect((await get(app)).statusCode).toBe(200)
      expect((await get(app)).statusCode).toBe(200)
      expect((await get(app)).statusCode).toBe(429)
    })

    it('publishes the recovery for the alert to clear', async () => {
      // The recovery is observed by the *next* scheduled probe, so the clock is
      // driven rather than waited on — a real 15 s wait here would be a test that
      // fails under load instead of on logic.
      vi.useFakeTimers()

      try {
        redis.failing = true
        app = await buildApp()
        await vi.advanceTimersByTimeAsync(0)

        expect(metricsState.up.set).toHaveBeenLastCalledWith({ subsystem: 'http-rate-limit' }, 0)

        redis.failing = false
        await vi.advanceTimersByTimeAsync(15_000)

        expect(metricsState.recovered.inc).toHaveBeenCalledWith({ subsystem: 'http-rate-limit' })
        expect(metricsState.up.set).toHaveBeenLastCalledWith({ subsystem: 'http-rate-limit' }, 1)
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ subsystem: 'http-rate-limit' }),
          RATE_LIMITER_LOGS.HTTP_INFRA_RECOVERED,
        )
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
