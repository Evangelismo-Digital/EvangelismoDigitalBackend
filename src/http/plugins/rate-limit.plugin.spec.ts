import { describe, expect, it, vi } from 'vitest'

const { mockRateLimit, mockRedisConnection, mockGetRedisRateLimit, mockResilientStoreFor } = vi.hoisted(() => {
  const mockRateLimit = vi.fn()
  const mockRedisConnection = { connection: 'redis-rate-limit' }
  const mockGetRedisRateLimit = vi.fn(() => mockRedisConnection)
  const mockResilientStoreFor = vi.fn(() => class StubStore {})

  return { mockRateLimit, mockRedisConnection, mockGetRedisRateLimit, mockResilientStoreFor }
})

vi.mock('@fastify/rate-limit', () => ({
  default: mockRateLimit,
}))

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisRateLimit: mockGetRedisRateLimit,
}))

vi.mock('@lib/infra/rate-limiter/resilient-rate-limit-store', () => ({
  resilientRateLimitStoreFor: mockResilientStoreFor,
}))

import { httpRateLimitPlugin } from './rate-limit.plugin'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

describe('httpRateLimitPlugin', () => {
  it('registers a global IP rate limiter backed by the resilient store', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const addHook = vi.fn()
    const app = { register, addHook }

    await httpRateLimitPlugin(app as never, {} as never)

    expect(mockGetRedisRateLimit).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(
      mockRateLimit,
      expect.objectContaining({
        global: true,
        hook: 'onRequest',
        max: 300,
        skipOnError: false,
        timeWindow: '1 minute',
        store: expect.any(Function),
      }),
    )

    // `redis` would install the plugin's own store, whose Redis failures reach
    // the request; the store option is the whole point of the change.
    const registered = register.mock.calls[0][1] as Record<string, unknown>
    expect(registered.redis).toBeUndefined()
    expect(mockResilientStoreFor).toHaveBeenCalledWith(mockRedisConnection)

    const options = register.mock.calls[0][1] as { keyGenerator: (request: { ip: string }) => string }
    expect(options.keyGenerator({ ip: '203.0.113.10' })).toBe('203.0.113.10')
  })

  it('registers onRoute hook to apply default rate limits', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const addHook = vi.fn()
    const app = { register, addHook }

    await httpRateLimitPlugin(app as never, {} as never)

    expect(addHook).toHaveBeenCalledWith('onRoute', expect.any(Function))
    const onRouteHook = addHook.mock.calls.find((call) => call[0] === 'onRoute')?.[1] as (routeOptions: any) => void
    expect(onRouteHook).toBeDefined()

    // Case 1: routeOptions has no config
    const route1 = { config: undefined }
    onRouteHook(route1)
    expect(route1.config).toEqual({ rateLimit: HTTP_RATE_LIMIT_POLICIES.global })

    // Case 2: routeOptions has config but no rateLimit
    const route2 = { config: { other: true } as any }
    onRouteHook(route2)
    expect(route2.config.rateLimit).toEqual(HTTP_RATE_LIMIT_POLICIES.global)

    // Case 3: routeOptions has explicitly disabled rateLimit (false)
    const route3 = { config: { rateLimit: false } }
    onRouteHook(route3)
    expect(route3.config.rateLimit).toBe(false)

    // Case 4: routeOptions already has a rateLimit policy configured
    const customPolicy = { max: 10, timeWindow: '1 minute' }
    const route4 = { config: { rateLimit: customPolicy } }
    onRouteHook(route4)
    expect(route4.config.rateLimit).toBe(customPolicy)
  })
})
