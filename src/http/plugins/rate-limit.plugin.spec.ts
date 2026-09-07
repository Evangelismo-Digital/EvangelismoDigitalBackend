import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mockRateLimit, mockRedisConnection, mockGetRedisRateLimit, mockProbe, mockProbeFor } = vi.hoisted(() => {
  const mockRateLimit = vi.fn()
  const mockRedisConnection = { connection: 'redis-rate-limit' }
  const mockGetRedisRateLimit = vi.fn(() => mockRedisConnection)
  const mockProbe = { start: vi.fn(), stop: vi.fn() }
  const mockProbeFor = vi.fn(() => mockProbe)

  return { mockRateLimit, mockRedisConnection, mockGetRedisRateLimit, mockProbe, mockProbeFor }
})

vi.mock('@fastify/rate-limit', () => ({
  default: mockRateLimit,
}))

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisRateLimit: mockGetRedisRateLimit,
}))

vi.mock('@lib/infra/rate-limiter/rate-limit-health-probe', () => ({
  rateLimitHealthProbeFor: mockProbeFor,
}))

import { httpRateLimitPlugin } from './rate-limit.plugin'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

function fakeApp() {
  const register = vi.fn().mockResolvedValue(undefined)
  const addHook = vi.fn()

  return { register, addHook, app: { register, addHook } }
}

describe('httpRateLimitPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers a global Redis-backed IP rate limiter that fails open', async () => {
    const { register } = fakeApp()
    const app = { register, addHook: vi.fn() }

    await httpRateLimitPlugin(app as never, {} as never)

    expect(mockGetRedisRateLimit).toHaveBeenCalled()
    expect(register).toHaveBeenCalledWith(
      mockRateLimit,
      expect.objectContaining({
        global: true,
        hook: 'onRequest',
        max: 300,
        timeWindow: '1 minute',
        redis: mockRedisConnection,
        // The defect this replaced: `false` turned a Redis blip into HTTP 500 for
        // every caller. Redis stays the only store; when it cannot answer, the
        // limit is skipped and the health probe reports it.
        skipOnError: true,
      }),
    )

    const options = register.mock.calls[0][1] as { keyGenerator: (request: { ip: string }) => string }
    expect(options.keyGenerator({ ip: '203.0.113.10' })).toBe('203.0.113.10')
  })

  it('does not install a custom store — Redis is the single source of truth', async () => {
    const { register, app } = fakeApp()

    await httpRateLimitPlugin(app as never, {} as never)

    const registered = register.mock.calls[0][1] as Record<string, unknown>
    expect(registered.store).toBeUndefined()
  })

  it('starts the health probe, so a skipped limit is never silent', async () => {
    const { app } = fakeApp()

    await httpRateLimitPlugin(app as never, {} as never)

    expect(mockProbeFor).toHaveBeenCalledWith(mockRedisConnection)
    expect(mockProbe.start).toHaveBeenCalledOnce()
  })

  it('stops the probe when the app closes, leaving no timer behind', async () => {
    const { addHook, app } = fakeApp()

    await httpRateLimitPlugin(app as never, {} as never)

    const onClose = addHook.mock.calls.find((call) => call[0] === 'onClose')?.[1] as () => void
    expect(onClose).toBeDefined()
    expect(mockProbe.stop).not.toHaveBeenCalled()

    onClose()

    expect(mockProbe.stop).toHaveBeenCalledOnce()
  })

  it('registers onRoute hook to apply default rate limits', async () => {
    const { addHook, app } = fakeApp()

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
