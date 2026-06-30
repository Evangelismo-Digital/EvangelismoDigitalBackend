import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResilientAddressProviderDecorator } from './resilient-address-provider.decorator'
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

describe('ResilientAddressProviderDecorator Sleep Signal handling', () => {
  let rawProviderMock: any
  let redisMock: any
  let decorator: ResilientAddressProviderDecorator

  beforeEach(() => {
    rawProviderMock = {
      providerName: 'TestProvider',
      rateLimitConfig: {},
      maxRetries: 3,
      backoffMs: 1000,
      fetchRawAddress: vi.fn(),
    }
    redisMock = {} as Redis
    decorator = new ResilientAddressProviderDecorator(rawProviderMock, redisMock)
  })

  it('should abort sleep early when signal aborts during backoff', async () => {
    rawProviderMock.fetchRawAddress.mockRejectedValueOnce(new Error('Retryable network error'))
    rawProviderMock.fetchRawAddress.mockResolvedValueOnce({ cep: '12345678' })

    const controller = new AbortController()
    const fetchPromise = decorator.fetchAddress('12345678', controller.signal)

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
