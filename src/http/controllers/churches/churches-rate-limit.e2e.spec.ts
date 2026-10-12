import request from 'supertest'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ok } from 'core/shared/result'
import { getRedisRateLimit } from '@lib/redis/clients/clients'

const { nearestChurchesResponse, mockExecute, mockMakeFindNearestChurchesUseCase } = vi.hoisted(() => {
  const nearestChurchesResponse = {
    nearestChurchesInfo: [],
    totalFound: 0,
    precision: 'mocked',
    providerName: 'mocked-provider',
  }

  const mockExecute = vi.fn(() => Promise.resolve(ok(nearestChurchesResponse)))
  const mockMakeFindNearestChurchesUseCase = vi.fn(() => ({
    execute: mockExecute,
  }))

  return { nearestChurchesResponse, mockExecute, mockMakeFindNearestChurchesUseCase }
})

/**
 * Overrides ONLY the policy under test, on top of the real ones.
 *
 * This used to restate every policy group as a literal, which made the mock a
 * hand-maintained copy of `HTTP_RATE_LIMIT_POLICIES` — and adding a new group to
 * the real module (analytics) broke this file at route registration with
 * `Cannot read properties of undefined`, in a suite that has nothing to do with
 * analytics. Spreading the real object means a new group is picked up for free
 * and only `churches.nearest` is deliberately different.
 */
vi.mock('@http/policies/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@http/policies/rate-limit')>()

  return {
    HTTP_RATE_LIMIT_POLICIES: {
      ...actual.HTTP_RATE_LIMIT_POLICIES,
      churches: { nearest: { max: 1, timeWindow: '1 minute' } },
    },
  }
})

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
