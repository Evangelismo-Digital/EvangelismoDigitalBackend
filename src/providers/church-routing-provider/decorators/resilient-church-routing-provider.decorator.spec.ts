import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockTryConsume, mockRecordProviderRequest, mockStartTimer } = vi.hoisted(() => ({
  mockTryConsume: vi.fn(),
  mockRecordProviderRequest: vi.fn(),
  mockStartTimer: vi.fn(() => vi.fn()),
}))

vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  EnumProviderConfig: { STADIA_ROUTING: 'stadiaRoutingProvider' },
  RedisRateLimiter: { getInstance: vi.fn(() => ({ tryConsume: mockTryConsume })) },
}))

vi.mock('@lib/metrics/provider-metrics', () => ({
  recordProviderRequest: mockRecordProviderRequest,
  collectMetricsProviderLatency: { startTimer: mockStartTimer },
}))

import type Redis from 'ioredis'
import { ResilientChurchRoutingProviderDecorator } from './resilient-church-routing-provider.decorator'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { isOk, isErr } from 'core/shared/result'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { Deadline } from 'core/shared/deadline'
import { DeadlineExceededError } from 'errors/infrastructure/deadline-exceeded-error'

function makeRaw(overrides: Partial<IRawChurchRoutingProvider> = {}): IRawChurchRoutingProvider {
  return {
    providerName: 'Stadia',
    rateLimitConfig: EnumProviderConfig.STADIA_ROUTING,
    timeoutMs: 3000,
    maxRetries: 2,
    // Zero backoff keeps the retry tests free of any real waiting.
    backoffMs: 0,
    defaultCosting: RoutingProfile.PEDESTRIAN,
    fetchRawDistances: vi.fn(),
    ...overrides,
  }
}

const origin = { lat: -23.55, lon: -46.63 }
const destinations = [{ lat: -23.5, lon: -46.6 }]

describe('ResilientChurchRoutingProviderDecorator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue(true)
  })

  it('copies the raw provider name', () => {
    const decorator = new ResilientChurchRoutingProviderDecorator(makeRaw(), {} as Redis)
    expect(decorator.providerName).toBe('Stadia')
  })

  it('returns ServiceBusyError (and records it) when the rate limiter rejects', async () => {
    mockTryConsume.mockResolvedValue(false)
    const raw = makeRaw()
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    const result = await decorator.getDistances({ origin, destinations })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
    expect(raw.fetchRawDistances).not.toHaveBeenCalled()
    expect(mockRecordProviderRequest).toHaveBeenCalledWith('routing', 'Stadia', result)
  })

  it('returns a terminal ABORTED failure when the deadline is already expired', async () => {
    const controller = new AbortController()
    controller.abort('too slow')
    const raw = makeRaw()
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    const result = await decorator.getDistances({
      origin,
      destinations,
      deadline: Deadline.in(Infinity, { linkedTo: controller.signal }),
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(DeadlineExceededError)
    expect(raw.fetchRawDistances).not.toHaveBeenCalled()
    expect(mockRecordProviderRequest).toHaveBeenCalledWith('routing', 'Stadia', result)
  })

  it('passes the caller profile through to the raw provider', async () => {
    const raw = makeRaw()
    vi.mocked(raw.fetchRawDistances).mockResolvedValue([{ distance: 2 }])
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    await decorator.getDistances({ origin, destinations, profile: RoutingProfile.BICYCLE })

    expect(raw.fetchRawDistances).toHaveBeenCalledWith(
      origin,
      destinations,
      RoutingProfile.BICYCLE,
      expect.any(AbortSignal),
    )
  })

  it('falls back to defaultCosting, then AUTO, when no profile is given', async () => {
    const withDefault = makeRaw()
    vi.mocked(withDefault.fetchRawDistances).mockResolvedValue([{ distance: 1 }])
    await new ResilientChurchRoutingProviderDecorator(withDefault, {} as Redis).getDistances({
      origin,
      destinations,
    })
    expect(withDefault.fetchRawDistances).toHaveBeenCalledWith(
      origin,
      destinations,
      RoutingProfile.PEDESTRIAN,
      expect.any(AbortSignal),
    )

    const noDefault = makeRaw({ defaultCosting: undefined })
    vi.mocked(noDefault.fetchRawDistances).mockResolvedValue([{ distance: 1 }])
    await new ResilientChurchRoutingProviderDecorator(noDefault, {} as Redis).getDistances({
      origin,
      destinations,
    })
    expect(noDefault.fetchRawDistances).toHaveBeenCalledWith(
      origin,
      destinations,
      RoutingProfile.AUTO,
      expect.any(AbortSignal),
    )
  })

  it('wraps a successful raw call in ok() and records success', async () => {
    const raw = makeRaw()
    const rawResults = [{ distance: 3.2, status: 0 }]
    vi.mocked(raw.fetchRawDistances).mockResolvedValue(rawResults)
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    const result = await decorator.getDistances({ origin, destinations })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe(rawResults)
    expect(mockRecordProviderRequest).toHaveBeenCalledWith('routing', 'Stadia', result)
  })

  it('maps a thrown raw error through FindNearestChurchesErrorMapper and stops the timer', async () => {
    const stop = vi.fn()
    mockStartTimer.mockReturnValue(stop)
    const raw = makeRaw()
    vi.mocked(raw.fetchRawDistances).mockRejectedValue(new Error('network blew up'))
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    const result = await decorator.getDistances({ origin, destinations })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ProviderFailureError)
    expect(stop).toHaveBeenCalled()
    expect(mockRecordProviderRequest).toHaveBeenCalledWith('routing', 'Stadia', result)
  })

  it('tolerates a missing latency timer on the success path (optional chaining on endTimer)', async () => {
    mockStartTimer.mockReturnValue(undefined as never)
    const raw = makeRaw()
    vi.mocked(raw.fetchRawDistances).mockResolvedValue([{ distance: 1 }])
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    const result = await decorator.getDistances({ origin, destinations })

    expect(isOk(result)).toBe(true)
  })

  it('tolerates a missing latency timer on the failure path (optional chaining on endTimer)', async () => {
    mockStartTimer.mockReturnValue(undefined as never)
    const raw = makeRaw()
    vi.mocked(raw.fetchRawDistances).mockRejectedValue(new Error('kaboom'))
    const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

    const result = await decorator.getDistances({ origin, destinations })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(ProviderFailureError)
  })

  describe('retry loop (docs §4.3 — previously absent)', () => {
    function axios429() {
      return {
        name: 'AxiosError',
        message: 'Request failed with status code 429',
        isAxiosError: true,
        response: { status: 429, data: {}, statusText: '', headers: {}, config: { url: '/stadia' } },
        config: { url: '/stadia' },
        toJSON: () => ({}),
      }
    }

    it('recovers from a transient blip instead of failing the whole request', async () => {
      mockTryConsume.mockResolvedValue(true)
      const raw = makeRaw()
      vi.mocked(raw.fetchRawDistances)
        .mockRejectedValueOnce(axios429())
        .mockResolvedValueOnce([{ distance: 4, status: 0 }])
      const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

      const result = await decorator.getDistances({ origin, destinations })

      expect(isOk(result)).toBe(true)
      expect(raw.fetchRawDistances).toHaveBeenCalledTimes(2)
    })

    it('consumes only one rate-limit point across the whole retry sequence', async () => {
      mockTryConsume.mockResolvedValue(true)
      const raw = makeRaw()
      vi.mocked(raw.fetchRawDistances)
        .mockRejectedValueOnce(axios429())
        .mockResolvedValueOnce([{ distance: 4, status: 0 }])
      const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

      await decorator.getDistances({ origin, destinations })

      // Matches the address and geocoding decorators: admission is charged once.
      expect(mockTryConsume).toHaveBeenCalledTimes(1)
    })

    it('still fails hard once the attempts are exhausted — there is no second routing provider', async () => {
      mockTryConsume.mockResolvedValue(true)
      const raw = makeRaw()
      vi.mocked(raw.fetchRawDistances).mockRejectedValue(axios429())
      const decorator = new ResilientChurchRoutingProviderDecorator(raw, {} as Redis)

      const result = await decorator.getDistances({ origin, destinations })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(ServiceBusyError)
      expect(raw.fetchRawDistances).toHaveBeenCalledTimes(2)
    })
  })
})
