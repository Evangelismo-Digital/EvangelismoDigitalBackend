import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResilientGeocodingProviderDecorator } from './resilient-geocoding-provider.decorator'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import Redis from 'ioredis'
import { err } from 'core/shared/result'

vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  RedisRateLimiter: {
    getInstance: vi.fn().mockReturnValue({
      tryConsume: vi.fn().mockResolvedValue(true),
    }),
  },
}))

vi.mock('@lib/logger', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('ResilientGeocodingProviderDecorator Sleep Signal handling', () => {
  let rawProviderMock: any
  let redisMock: any
  let decorator: ResilientGeocodingProviderDecorator

  beforeEach(() => {
    rawProviderMock = {
      providerName: 'TestProvider',
      rateLimitConfig: {},
      maxRetries: 3,
      backoffMs: 1000,
      searchRaw: vi.fn(),
    }
    redisMock = {} as Redis
    decorator = new ResilientGeocodingProviderDecorator(rawProviderMock, redisMock)
  })

  it('should abort sleep early when signal aborts during backoff', async () => {
    rawProviderMock.searchRaw.mockRejectedValueOnce(new Error('Retryable network error'))
    rawProviderMock.searchRaw.mockResolvedValueOnce({ lat: 1, lon: 2 })

    const controller = new AbortController()
    const fetchPromise = decorator.search('some query', controller.signal)

    // Wait a short moment to ensure the first attempt has failed and we are in sleep
    await new Promise((r) => setTimeout(r, 100))
    controller.abort('timeout')

    const start = Date.now()
    const result = await fetchPromise
    const duration = Date.now() - start

    // The duration should be significantly less than 1000ms (backoffMs)
    expect(duration).toBeLessThan(500)
    expect(result).toEqual(err(new TimeoutExceededError('timeout')))
  })
})
