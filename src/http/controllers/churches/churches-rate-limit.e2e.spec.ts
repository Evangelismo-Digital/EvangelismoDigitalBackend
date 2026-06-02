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
        registerAdmin: {
          max: 15,
          timeWindow: '1 hour',
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

function createForwardedIp() {
  return `203.0.113.${Math.floor(Math.random() * 200) + 1}`
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
