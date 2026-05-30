import { describe, expect, it, vi } from 'vitest'

const { mockRateLimit, mockRedisConnection, mockGetRedisRateLimit } = vi.hoisted(() => {
  const mockRateLimit = vi.fn()
  const mockRedisConnection = { connection: 'redis-rate-limit' }
  const mockGetRedisRateLimit = vi.fn(() => mockRedisConnection)

  return { mockRateLimit, mockRedisConnection, mockGetRedisRateLimit }
})

vi.mock('@fastify/rate-limit', () => ({
  default: mockRateLimit,
}))

vi.mock('@lib/redis/clients/clients', () => ({
  getRedisRateLimit: mockGetRedisRateLimit,
}))

import { httpRateLimitPlugin } from './rate-limit.plugin'

describe('httpRateLimitPlugin', () => {
  it('registers a global Redis-backed IP rate limiter', async () => {
    const register = vi.fn().mockResolvedValue(undefined)
    const app = { register }

    await httpRateLimitPlugin(app as never)

    expect(mockGetRedisRateLimit).toHaveBeenCalledTimes(1)
    expect(register).toHaveBeenCalledWith(
      mockRateLimit,
      expect.objectContaining({
        global: true,
        hook: 'onRequest',
        max: 300,
        skipOnError: true,
        timeWindow: '1 minute',
        redis: mockRedisConnection,
      }),
    )

    const options = register.mock.calls[0][1] as { keyGenerator: (request: { ip: string }) => string }
    expect(options.keyGenerator({ ip: '203.0.113.10' })).toBe('203.0.113.10')
  })
})
