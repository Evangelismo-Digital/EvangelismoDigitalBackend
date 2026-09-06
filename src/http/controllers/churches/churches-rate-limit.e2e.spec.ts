import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ok } from 'core/shared/result'
import { getRedisRateLimit } from '@lib/redis/clients/clients'

const { nearestChurchesResponse, rateLimitPolicies, mockExecute, mockMakeFindNearestChurchesUseCase } = vi.hoisted(
  () => {
    const nearestChurchesResponse = {
      nearestChurchesInfo: [],
      totalFound: 0,
      precision: 'mocked',
      providerName: 'mocked-provider',
    }

    const rateLimitPolicies = {
      global: {
        max: 300,
        timeWindow: '1 minute',
      },
      auth: {
        session: {
          max: 30,
          timeWindow: '1 minute',
        },
        register: {
          max: 1000,
          timeWindow: '1 minute',
        },
        forgotPassword: {
          max: 100,
          timeWindow: '1 hour',
        },
        resetPassword: {
          max: 200,
          timeWindow: '1 hour',
        },
      },
      users: {
        list: {
          max: 20,
          timeWindow: '1 hour',
        },
        delete: {
          max: 10,
          timeWindow: '1 hour',
        },
      },
      churches: {
        nearest: {
          max: 1,
          timeWindow: '1 minute',
        },
      },
      forms: {
        submit: {
          max: 60,
          timeWindow: '1 minute',
        },
      },
      health: {
        check: {
          max: 120,
          timeWindow: '1 minute',
        },
      },
    } as const

    const mockExecute = vi.fn(() => Promise.resolve(ok(nearestChurchesResponse)))
    const mockMakeFindNearestChurchesUseCase = vi.fn(() => ({
      execute: mockExecute,
    }))

    return { nearestChurchesResponse, rateLimitPolicies, mockExecute, mockMakeFindNearestChurchesUseCase }
  },
)

vi.mock('@http/policies/rate-limit', () => ({
  HTTP_RATE_LIMIT_POLICIES: rateLimitPolicies,
}))

vi.mock('@use-cases/factories/make-find-nearest-churches-use-case', () => ({
  makeFindNearestChurchesUseCase: mockMakeFindNearestChurchesUseCase,
}))

import { app } from 'app'

/**
 * Rate-limit counters live in Redis keyed by the client IP
 * (`keyGenerator: request.ip`), they outlive the process, and this suite sets
 * `churches.nearest.max` to 1 per minute. An address is therefore single-use
 * for a whole minute, across every run that shares the Redis instance.
 *
 * The previous generator drew from only 200 addresses with no guarantee that
 * two draws differed, so the control request could land on an address already
 * spent — by the *same* test (a ~1-in-200 self-collision) or by a concurrent
 * suite — and get a 429 where the test demands a 200. That is what failed under
 * two overlapping runs.
 *
 * Fixed on both axes: addresses are issued sequentially from a per-process
 * random offset, so two draws in one run can never collide, and the pool is
 * 198.18.0.0/15 — IANA's benchmarking range, public enough for `trustProxy` to
 * keep it — giving 65 536 addresses instead of 200.
 */
const ipOffset = Math.floor(Math.random() * 65_536)
let ipsIssued = 0

function createForwardedIp() {
  const host = (ipOffset + ipsIssued++) % 65_536
  return `198.18.${host >> 8}.${host & 0xff}`
}

import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

describe('churches nearest route rate limit (e2e)', () => {
  beforeAll(async () => {
    await app.ready()
    const redis = getRedisRateLimit()
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve) => {
        redis.once('ready', () => resolve())
      })
    }
  })

  afterEach(() => {
    mockExecute.mockClear()
    mockMakeFindNearestChurchesUseCase.mockClear()
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 429 for repeated requests from the same ip and allows a different ip', async () => {
    const sharedIp = createForwardedIp()
    const otherIp = createForwardedIp()
    const query = { cep: '01310100' }

    // The premise of the whole test: if these two ever coincide, the "different
    // ip" control request is really a third request from the throttled ip, and
    // the 200 it asserts is unobtainable.
    expect(otherIp).not.toBe(sharedIp)

    const firstResponse = await request(app.server)
      .get('/churches/nearest')
      .query(query)
      .set('x-forwarded-for', sharedIp)

    const secondResponse = await request(app.server)
      .get('/churches/nearest')
      .query(query)
      .set('x-forwarded-for', sharedIp)

    const controlResponse = await request(app.server)
      .get('/churches/nearest')
      .query(query)
      .set('x-forwarded-for', otherIp)

    expect(firstResponse.statusCode).toBe(200)
    expect(firstResponse.body).toEqual(nearestChurchesResponse)
    expect(secondResponse.statusCode).toBe(429)
    expect(controlResponse.statusCode).toBe(200)
    expect(controlResponse.body).toEqual(nearestChurchesResponse)
    expect(mockMakeFindNearestChurchesUseCase).toHaveBeenCalled()
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })
})
