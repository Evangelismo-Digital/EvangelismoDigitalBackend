import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **a doomed request still spent a rate-limit point.**
 *
 * All three provider decorators consumed a token *before* checking whether the
 * request still had any budget, so a request whose client had already gone away
 * — or whose deadline had already passed — burned quota it could never use.
 * That quota is genuinely scarce: ViaCEP and Nominatim allow one request per
 * second each, so every wasted token delays a live request queued behind it.
 *
 * The check now precedes the consume, in one shared admission gate.
 * Defect D6 in docs/timeout-and-cancellation-model.md.
 */

const mockTryConsume = vi.fn()

vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  RedisRateLimiter: { getInstance: () => ({ tryConsume: mockTryConsume }) },
  EnumProviderConfig: { VIACEP_ADDRESS: 'viacepAddressProvider', NOMINATIM_GEOCODING: 'nominatimGeocodingProvider' },
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { checkAdmission } from './provider-admission'
import { ResilientAddressProviderDecorator } from 'providers/address-provider/decorators/resilient-address-provider.decorator'
import { ResilientGeocodingProviderDecorator } from 'providers/geo-provider/decorators/resilient-geocoding-provider.decorator'
import { Deadline } from 'core/shared/deadline'
import { isErr } from 'core/shared/result'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import type Redis from 'ioredis'

const redis = {} as Redis

describe('regression: an expired request must not spend provider quota', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The limiter would happily allow it — the point is that we never ask.
    mockTryConsume.mockResolvedValue(true)
  })

  describe('the admission gate itself', () => {
    it('does not ask the limiter when the budget is already spent', async () => {
      const result = await checkAdmission({
        deadline: Deadline.in(0),
        providerName: 'ViaCEP',
        rateLimitConfig: EnumProviderConfig.VIACEP_ADDRESS,
        redis,
      })

      expect(mockTryConsume).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(DeadlineExceededError)
      }
    })

    it('does not ask the limiter when the caller has disconnected', async () => {
      const client = new AbortController()
      const deadline = Deadline.in(30_000, { linkedTo: client.signal })
      client.abort('client disconnected')

      await checkAdmission({
        deadline,
        providerName: 'ViaCEP',
        rateLimitConfig: EnumProviderConfig.VIACEP_ADDRESS,
        redis,
      })

      expect(mockTryConsume).not.toHaveBeenCalled()
    })
  })

  describe('through the address decorator', () => {
    it('spends nothing and calls nothing on an expired budget', async () => {
      const rawProvider = {
        providerName: 'ViaCEP',
        rateLimitConfig: EnumProviderConfig.VIACEP_ADDRESS,
        maxRetries: 2,
        backoffMs: 0,
        timeoutMs: 2_000,
        fetchRawAddress: vi.fn(),
      }
      const decorator = new ResilientAddressProviderDecorator(rawProvider, redis)

      const result = await decorator.fetchAddress('01310100', Deadline.in(0))

      expect(mockTryConsume).not.toHaveBeenCalled()
      expect(rawProvider.fetchRawAddress).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
    })
  })

  describe('through the geocoding decorator', () => {
    it('spends nothing and calls nothing on an expired budget', async () => {
      const rawProvider = {
        providerName: 'Nominatim',
        rateLimitConfig: EnumProviderConfig.NOMINATIM_GEOCODING,
        maxRetries: 2,
        backoffMs: 0,
        timeoutMs: 3_000,
        searchRaw: vi.fn(),
        searchStructuredRaw: vi.fn(),
      }
      const decorator = new ResilientGeocodingProviderDecorator(rawProvider, redis)

      await decorator.search('Av Paulista', Deadline.in(0))
      await decorator.searchStructured({ city: 'São Paulo', state: 'SP', country: 'BR' }, Deadline.in(0))

      expect(mockTryConsume).not.toHaveBeenCalled()
      expect(rawProvider.searchRaw).not.toHaveBeenCalled()
      expect(rawProvider.searchStructuredRaw).not.toHaveBeenCalled()
    })
  })

  it('still spends exactly one point for a request that does have budget', async () => {
    // The guard must not have turned into "never consume".
    const result = await checkAdmission({
      deadline: Deadline.in(30_000),
      providerName: 'ViaCEP',
      rateLimitConfig: EnumProviderConfig.VIACEP_ADDRESS,
      redis,
    })

    expect(mockTryConsume).toHaveBeenCalledOnce()
    expect(isErr(result)).toBe(false)
  })
})
