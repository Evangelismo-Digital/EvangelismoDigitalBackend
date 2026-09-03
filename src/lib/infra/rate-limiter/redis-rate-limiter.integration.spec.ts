/**
 * Integration — RedisRateLimiter (real token bucket) + the Fastify HTTP
 * rate-limit plugin, both backed by a real Redis (docker-compose).
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import Redis from 'ioredis'
import { env } from '@env/index'
import { RedisRateLimiter, EnumProviderConfig } from './redis-rate-limiter'
import { getRedisRateLimit, closeAllRedisConnections } from '@lib/redis/clients/clients'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function flushRateLimitKeys(client: Redis) {
  const keys = await client.keys('ratelimit:*')
  if (keys.length) await client.del(...keys)
}

describe('RedisRateLimiter (integration, real Redis token bucket)', () => {
  let client: Redis

  beforeAll(async () => {
    client = getRedisRateLimit()
    if (client.status !== 'ready') await new Promise<void>((r) => client.once('ready', () => r()))
  })

  afterEach(async () => {
    await RedisRateLimiter.destroyInstance()
    await flushRateLimitKeys(client)
  })

  afterAll(async () => {
    await closeAllRedisConnections()
  })

  it('enforces the per-provider quota within the window, then refills after it', async () => {
    const limiter = RedisRateLimiter.getInstance(client)

    // VIACEP_ADDRESS is configured at 1 point / 1s.
    expect(await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)).toBe(true)
    expect(await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)).toBe(false)

    await wait(1_100)

    expect(await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)).toBe(true)
  })

  it('keeps each provider bucket independent', async () => {
    const limiter = RedisRateLimiter.getInstance(client)

    // Exhaust ViaCEP (1/s) …
    await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)
    expect(await limiter.tryConsume(EnumProviderConfig.VIACEP_ADDRESS)).toBe(false)

    // … Awesome (5/s) is untouched.
    expect(await limiter.tryConsume(EnumProviderConfig.AWESOME_API_ADDRESS)).toBe(true)
    expect(await limiter.tryConsume(EnumProviderConfig.AWESOME_API_ADDRESS)).toBe(true)
  })

  it('fails OPEN when Redis is unreachable (returns true so internal traffic is not blocked)', async () => {
    const deadRedis = new Redis({
      host: env.REDIS_HOST,
      port: 6399, // nothing listening
      password: env.REDIS_PASSWORD,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      enableOfflineQueue: false,
    })
    // suppress unhandled 'error' events from the dead client
    deadRedis.on('error', () => {})

    const limiter = RedisRateLimiter.getInstance(deadRedis)

    expect(await limiter.tryConsume(EnumProviderConfig.NOMINATIM_GEOCODING)).toBe(true)

    await deadRedis.quit().catch(() => {})
  })
})

// ── HTTP boundary: the @fastify/rate-limit plugin over a real Redis store ──────

const { lowPolicies, mockExecute, mockFactory } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue({
    success: true,
    value: { sanitizedFormSubmission: { name: 'x' }, outboxEvent: { publicId: 'evt', payload: {} } },
  })
  return {
    lowPolicies: {
      global: { max: 1000, timeWindow: '1 minute' },
      auth: {
        session: { max: 1000, timeWindow: '1 minute' },
        register: { max: 1000, timeWindow: '1 minute' },
        forgotPassword: { max: 1000, timeWindow: '1 hour' },
        resetPassword: { max: 1000, timeWindow: '1 hour' },
      },
      users: {
        list: { max: 1000, timeWindow: '1 hour' },
        delete: { max: 1000, timeWindow: '1 hour' },
      },
      churches: { nearest: { max: 1000, timeWindow: '1 minute' } },
      forms: { submit: { max: 2, timeWindow: '1 minute' } },
      health: { check: { max: 1000, timeWindow: '1 minute' } },
    },
    mockExecute,
    mockFactory: vi.fn(() => ({ execute: mockExecute })),
  }
})

vi.mock('@http/policies/rate-limit', () => ({ HTTP_RATE_LIMIT_POLICIES: lowPolicies }))
vi.mock('@use-cases/forms/factories/make-form-submission-use-case', () => ({
  makeFormSubmissionUseCase: mockFactory,
}))
vi.mock('@lib/infra/events/outbox-signal', () => ({
  OutboxSignal: { publishNewItem: vi.fn().mockResolvedValue(undefined) },
}))

// eslint-disable-next-line import/first
import request from 'supertest'
// eslint-disable-next-line import/first
import { app } from 'app'

describe('HTTP rate-limit plugin (integration, real Redis store)', () => {
  beforeAll(async () => {
    await app.ready()
    const redis = getRedisRateLimit()
    if (redis.status !== 'ready') await new Promise<void>((r) => redis.once('ready', () => r()))
  })

  afterAll(async () => {
    await app.close()
    await closeAllRedisConnections()
  })

  const body = { name: 'João', lastName: 'Silva', email: 'ratelimit@test.com', decisaoPorCristo: false }

  it('returns 429 once the per-route quota is exceeded for an IP, but allows a different IP', async () => {
    const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`
    const otherIp = `203.0.113.${Math.floor(Math.random() * 250) + 1}`

    const r1 = await request(app.server).post('/forms/submit-form').set('x-forwarded-for', ip).send(body)
    const r2 = await request(app.server).post('/forms/submit-form').set('x-forwarded-for', ip).send(body)
    const r3 = await request(app.server).post('/forms/submit-form').set('x-forwarded-for', ip).send(body)
    const rOther = await request(app.server).post('/forms/submit-form').set('x-forwarded-for', otherIp).send(body)

    expect(r1.statusCode).toBe(201)
    expect(r2.statusCode).toBe(201)
    expect(r3.statusCode).toBe(429)
    expect(rOther.statusCode).toBe(201)
  })
})
