import { describe, it, expect, beforeEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'

/**
 * Regression: **a Redis hiccup returned HTTP 500 for every request.**
 *
 * The HTTP limiter was registered with the plugin's own Redis store and
 * `skipOnError: false`, so any failure of the store became the request's failure.
 * The rate-limiter connection is configured to fail fast on purpose — 100 ms
 * `commandTimeout`, `enableOfflineQueue: false`, `maxRetriesPerRequest: 0` (see
 * `redis-rate-limiter-connection.ts`) — so a merely *slow* Redis, not even a dead
 * one, was enough: `RedisStore.incr` rejected with "Stream isn't writeable and
 * enableOfflineQueue options is false" and the caller got a 500 from a component
 * whose entire job is to protect the service.
 *
 * Observed in CI on 2026-09-07: `analytics.e2e.spec.ts` returned 500 instead of
 * 201 while Redis was under load from parallel test projects. The request never
 * reached its controller.
 *
 * The fix is a store that falls back to counting in this process
 * (`resilient-rate-limit-store.ts`). The counterweight matters as much as the fix
 * here: "no longer 500s" must not be satisfied by a limiter that stopped limiting,
 * so every case below also pins down that the limit is still enforced.
 */

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('@env/index', () => ({
  env: {
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

const { mockGetRedisRateLimit, redisBehaviour } = vi.hoisted(() => {
  const redisBehaviour = { failing: true, count: 0 }

  const outage = () => new Error("Stream isn't writeable and enableOfflineQueue options is false")
  const reply = (): [number, number] => {
    redisBehaviour.count += 1

    return [redisBehaviour.count, 60_000]
  }

  /**
   * Stands in for the rate-limiter connection, healthy or not, on demand.
   *
   * A custom ioredis command answers either style: a promise, which is what the
   * resilient store uses, or a trailing callback, which is what the plugin's own
   * Redis store used before the fix. Supporting both is what lets this spec be run
   * against the pre-fix code and see the real 500 rather than a hang.
   */
  const client: Record<string, unknown> = {
    defineCommand: (name: string) => {
      client[name] = (...args: unknown[]) => {
        const maybeCallback = args.at(-1)

        if (typeof maybeCallback === 'function') {
          const callback = maybeCallback as (error: Error | null, result?: [number, number]) => void

          redisBehaviour.failing ? callback(outage()) : callback(null, reply())

          return undefined
        }

        return redisBehaviour.failing ? Promise.reject(outage()) : Promise.resolve(reply())
      }
    },
  }

  return { mockGetRedisRateLimit: () => client, redisBehaviour }
})

vi.mock('@lib/redis/clients/clients', () => ({ getRedisRateLimit: mockGetRedisRateLimit }))

import { httpRateLimit } from './rate-limit.plugin'

const CALLER_IP = '203.0.113.10'

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify()

  await app.register(httpRateLimit)

  app.get('/probe', { config: { rateLimit: { max: 2, timeWindow: 1_000 } } }, async () => ({ ok: true }))

  await app.ready()

  return app
}

async function get(app: FastifyInstance) {
  return app.inject({ method: 'GET', url: '/probe', remoteAddress: CALLER_IP })
}

describe('regression: a Redis outage must not take the API down with it', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    redisBehaviour.failing = true
    redisBehaviour.count = 0
    app = await buildApp()
  })

  it('serves the request instead of returning 500 when Redis is unreachable', async () => {
    const response = await get(app)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })

  it('serves every request of a burst, not just the first', async () => {
    const statuses = [(await get(app)).statusCode, (await get(app)).statusCode]

    expect(statuses).toEqual([200, 200])
  })

  it('COUNTERWEIGHT: still enforces the limit while degraded, from the local count', async () => {
    // If the fix had been `skipOnError: true`, the outage would have removed the
    // limit entirely and this request would be a 200.
    await get(app)
    await get(app)

    const overTheLimit = await get(app)

    expect(overTheLimit.statusCode).toBe(429)
  })

  it('COUNTERWEIGHT: still enforces the limit from Redis when Redis is healthy', async () => {
    redisBehaviour.failing = false

    await get(app)
    await get(app)

    expect((await get(app)).statusCode).toBe(429)
    expect(redisBehaviour.count).toBe(3)
  })

  it('goes back to the shared Redis count once Redis recovers', async () => {
    await get(app)
    redisBehaviour.failing = false

    const afterRecovery = await get(app)

    expect(afterRecovery.statusCode).toBe(200)
    // Redis, not the local tally, is answering again.
    expect(redisBehaviour.count).toBe(1)
  })
})
