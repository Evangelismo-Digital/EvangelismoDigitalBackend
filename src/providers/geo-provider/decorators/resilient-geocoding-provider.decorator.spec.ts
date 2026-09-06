import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResilientGeocodingProviderDecorator } from './resilient-geocoding-provider.decorator'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { Deadline } from 'core/shared/deadline'
import { logger } from '@lib/logger'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import Redis from 'ioredis'
import { err, isOk, isErr } from 'core/shared/result'

const { mockTryConsume } = vi.hoisted(() => ({ mockTryConsume: vi.fn() }))

vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  RedisRateLimiter: { getInstance: vi.fn(() => ({ tryConsume: mockTryConsume })) },
  EnumProviderConfig: {},
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
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue(true)
    rawProviderMock = {
      providerName: 'TestProvider',
      rateLimitConfig: {},
      maxRetries: 3,
      backoffMs: 1000,
      timeoutMs: 2000,
      searchRaw: vi.fn(),
    }
    redisMock = {} as Redis
    decorator = new ResilientGeocodingProviderDecorator(rawProviderMock, redisMock)
  })

  it('should abort sleep early when the deadline expires during backoff', async () => {
    rawProviderMock.searchRaw.mockRejectedValueOnce(new Error('Retryable network error'))
    rawProviderMock.searchRaw.mockResolvedValueOnce({ lat: 1, lon: 2 })

    const controller = new AbortController()
    const fetchPromise = decorator.search('some query', Deadline.in(Infinity, { linkedTo: controller.signal }))

    // Wait a short moment to ensure the first attempt has failed and we are in sleep
    await new Promise((r) => setTimeout(r, 100))
    controller.abort('timeout')

    const start = Date.now()
    const result = await fetchPromise
    const duration = Date.now() - start

    // The duration should be significantly less than 1000ms (backoffMs)
    expect(duration).toBeLessThan(500)
    expect(result).toEqual(err(new DeadlineExceededError('timeout')))
  })

  it('hands the raw provider the query and an attempt-scoped signal', async () => {
    rawProviderMock.searchRaw.mockResolvedValue({ lat: 1, lon: 2 })

    const result = await decorator.search('Av Paulista')

    expect(isOk(result)).toBe(true)
    expect(rawProviderMock.searchRaw).toHaveBeenCalledWith('Av Paulista', expect.any(AbortSignal))
  })

  it('routes searchStructured through the same admission and retry path', async () => {
    rawProviderMock.searchStructuredRaw = vi.fn().mockResolvedValue({ lat: 1, lon: 2 })

    const result = await decorator.searchStructured({ city: 'São Paulo', state: 'SP', country: 'BR' })

    expect(isOk(result)).toBe(true)
    expect(rawProviderMock.searchStructuredRaw).toHaveBeenCalledWith(
      expect.objectContaining({ city: 'São Paulo' }),
      expect.any(AbortSignal),
    )
  })

  it('never calls the raw provider when admission is refused', async () => {
    mockTryConsume.mockResolvedValueOnce(false)

    const result = await decorator.search('Av Paulista')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
    expect(rawProviderMock.searchRaw).not.toHaveBeenCalled()
  })

  it('does not spend a rate-limit point on an already-expired budget', async () => {
    const result = await decorator.search('Av Paulista', Deadline.in(0))

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    expect(mockTryConsume).not.toHaveBeenCalled()
  })

  it('carries the query into the retry diagnostics', async () => {
    rawProviderMock.searchRaw.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce({ lat: 1, lon: 2 })

    await decorator.search('Av Paulista')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Av Paulista' }),
      expect.stringContaining('TestProvider'),
    )
  })

  it('carries the structured options into the retry diagnostics', async () => {
    rawProviderMock.searchStructuredRaw = vi
      .fn()
      .mockRejectedValueOnce(new Error('blip'))
      .mockResolvedValueOnce({ lat: 1, lon: 2 })

    await decorator.searchStructured({ city: 'São Paulo', state: 'SP', country: 'BR' })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ options: expect.objectContaining({ city: 'São Paulo' }) }),
      expect.stringContaining('TestProvider'),
    )
  })
})
