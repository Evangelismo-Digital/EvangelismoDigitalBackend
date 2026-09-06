import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResilientAddressProviderDecorator } from './resilient-address-provider.decorator'
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

describe('ResilientAddressProviderDecorator Sleep Signal handling', () => {
  let rawProviderMock: any
  let redisMock: any
  let decorator: ResilientAddressProviderDecorator

  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue(true)
    rawProviderMock = {
      providerName: 'TestProvider',
      rateLimitConfig: {},
      maxRetries: 3,
      backoffMs: 1000,
      timeoutMs: 2000,
      fetchRawAddress: vi.fn(),
    }
    redisMock = {} as Redis
    decorator = new ResilientAddressProviderDecorator(rawProviderMock, redisMock)
  })

  it('should abort sleep early when the deadline expires during backoff', async () => {
    rawProviderMock.fetchRawAddress.mockRejectedValueOnce(new Error('Retryable network error'))
    rawProviderMock.fetchRawAddress.mockResolvedValueOnce({ cep: '12345678' })

    const controller = new AbortController()
    const fetchPromise = decorator.fetchAddress('12345678', Deadline.in(Infinity, { linkedTo: controller.signal }))

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

  it('normalises the CEP and hands the raw provider an attempt-scoped signal', async () => {
    rawProviderMock.fetchRawAddress.mockResolvedValue({ localidade: 'São Paulo', uf: 'SP' })

    const result = await decorator.fetchAddress('01310-100')

    expect(isOk(result)).toBe(true)
    expect(rawProviderMock.fetchRawAddress).toHaveBeenCalledWith('01310100', expect.any(AbortSignal))
  })

  it('never calls the raw provider when admission is refused', async () => {
    mockTryConsume.mockResolvedValueOnce(false)

    const result = await decorator.fetchAddress('01310100')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
    expect(rawProviderMock.fetchRawAddress).not.toHaveBeenCalled()
  })

  it('does not spend a rate-limit point on an already-expired budget', async () => {
    const result = await decorator.fetchAddress('01310100', Deadline.in(0))

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    expect(mockTryConsume).not.toHaveBeenCalled()
    expect(rawProviderMock.fetchRawAddress).not.toHaveBeenCalled()
  })

  it('carries the CEP into the retry diagnostics', async () => {
    rawProviderMock.fetchRawAddress.mockRejectedValueOnce(new Error('blip')).mockResolvedValueOnce({ cep: '01310100' })

    await decorator.fetchAddress('01310-100')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ cep: '01310100' }),
      expect.stringContaining('TestProvider'),
    )
  })
})
