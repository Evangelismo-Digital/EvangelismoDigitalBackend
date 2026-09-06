import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockTryConsume = vi.fn()
vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  RedisRateLimiter: { getInstance: () => ({ tryConsume: mockTryConsume }) },
  EnumProviderConfig: { VIACEP_ADDRESS: 'viacepAddressProvider' },
}))

import { checkAdmission } from './provider-admission'
import { Deadline } from 'core/shared/deadline'
import { isOk, isErr } from 'core/shared/result'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import type Redis from 'ioredis'

function admit(deadline: Deadline) {
  return checkAdmission({
    deadline,
    providerName: 'ViaCEP',
    rateLimitConfig: EnumProviderConfig.VIACEP_ADDRESS,
    redis: {} as Redis,
  })
}

describe('checkAdmission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('admits the request when there is budget and the limiter allows it', async () => {
    mockTryConsume.mockResolvedValue(true)

    const result = await admit(Deadline.in(5_000))

    expect(isOk(result)).toBe(true)
    expect(mockTryConsume).toHaveBeenCalledOnce()
  })

  it('rejects with ServiceBusyError when the limiter refuses', async () => {
    mockTryConsume.mockResolvedValue(false)

    const result = await admit(Deadline.in(5_000))

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
  })

  describe('ordering (D6)', () => {
    it('does NOT spend a rate-limit point on an already-expired budget', async () => {
      mockTryConsume.mockResolvedValue(true)

      const result = await admit(Deadline.in(0))

      // The whole point: ViaCEP and Nominatim allow one request per second, so a
      // doomed request must not consume quota owed to a live one.
      expect(mockTryConsume).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    })

    it('does NOT spend a rate-limit point once the caller has gone away', async () => {
      mockTryConsume.mockResolvedValue(true)
      const client = new AbortController()
      const deadline = Deadline.in(30_000, { linkedTo: client.signal })
      client.abort('client desconectou')

      const result = await admit(deadline)

      expect(mockTryConsume).not.toHaveBeenCalled()
      expect(isErr(result)).toBe(true)
    })
  })
})
