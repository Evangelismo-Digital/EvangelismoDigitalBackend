import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StadiaChurchRoutingProvider } from './stadia-church-routing-provider'
import type Redis from 'ioredis'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ResilientChurchRoutingProviderDecorator } from './decorators/resilient-church-routing-provider.decorator'
import { IChurchRoutingProvider } from 'core/contracts/use-cases/providers/church-routing-provider.interface'

const { mockedPost, mockTryConsume } = vi.hoisted(() => {
  return {
    mockedPost: vi.fn(),
    mockTryConsume: vi.fn(),
  }
})

vi.mock('@lib/http/axios', () => ({
  createHttpClient: vi.fn(() => ({
    post: mockedPost,
  })),
}))

vi.mock('@lib/infra/rate-limiter/redis-rate-limiter', () => ({
  EnumProviderConfig: {
    STADIA_ROUTING: 'stadiaRoutingProvider',
  },
  RedisRateLimiter: {
    getInstance: vi.fn(() => ({
      tryConsume: mockTryConsume,
    })),
  },
}))

function buildProvider(): IChurchRoutingProvider {
  const redis = {} as unknown as Redis

  const rawProvider = new StadiaChurchRoutingProvider({
    apiUrl: 'https://api.stadiamaps.com/route/v1/',
    matrixApiUrl: 'https://api.stadiamaps.com/sources_to_targets',
    apiToken: 'test-token',
    defaultCosting: RoutingProfile.PEDESTRIAN,
    timeoutMs: 3000,
  })

  return new ResilientChurchRoutingProviderDecorator(rawProvider, redis)
}

describe('StadiaChurchRoutingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue(true)
  })

  it('uses batch matrix API for multiple destinations', async () => {
    mockedPost.mockResolvedValueOnce({
      status: 200,
      data: {
        sources_to_targets: [
          [
            { distance: 2.5, time: 300 },
            { distance: 1.8, time: 220 },
          ],
        ],
      },
    })

    const provider = buildProvider()

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [
        { lat: -23.551, lon: -46.634 },
        { lat: -23.560, lon: -46.640 },
      ],
      signal: new AbortController().signal,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toEqual([
        { distance: 2.5, status: 0 },
        { distance: 1.8, status: 0 },
      ])
    }

    expect(mockedPost).toHaveBeenCalledTimes(1)
    const [url, payload, requestConfig] = mockedPost.mock.calls[0]

    expect(url).toBe('https://api.stadiamaps.com/sources_to_targets')
    expect(payload).toEqual(
      expect.objectContaining({
        sources: [{ lat: -23.5505, lon: -46.6333 }],
        targets: [
          { lat: -23.551, lon: -46.634 },
          { lat: -23.560, lon: -46.640 },
        ],
        costing: 'pedestrian',
        units: 'kilometers',
      }),
    )
    expect(requestConfig.headers).toEqual({
      Authorization: 'Stadia-Auth test-token',
      'Content-Type': 'application/json',
    })
  })

  it('uses default costing and forwards abort signal to HTTP request', async () => {
    mockedPost.mockResolvedValueOnce({
      status: 200,
      data: {
        sources_to_targets: [
          [{ distance: 2.5, time: 300 }],
        ],
      },
    })

    const provider = buildProvider()
    const signal = new AbortController().signal

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
      signal,
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toEqual([{ distance: 2.5, status: 0 }])
    }
    const [, payload, requestConfig] = mockedPost.mock.calls[0]

    expect(payload).toEqual(
      expect.objectContaining({
        costing: 'pedestrian',
        units: 'kilometers',
      }),
    )
    expect(requestConfig).toEqual(
      expect.objectContaining({
        headers: {
          Authorization: 'Stadia-Auth test-token',
          'Content-Type': 'application/json',
        },
      }),
    )
    expect(requestConfig.signal).toBeDefined()
    expect(requestConfig.signal.aborted).toBe(false)
    expect(signal.aborted).toBe(false)
  })

  it('uses an explicit profile over the default costing', async () => {
    mockedPost.mockResolvedValueOnce({
      status: 200,
      data: {
        sources_to_targets: [
          [{ distance: 1.2, time: 150 }],
        ],
      },
    })

    const provider = buildProvider()

    await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
      profile: RoutingProfile.PEDESTRIAN,
    })

    expect(mockedPost).toHaveBeenCalledWith(
      'https://api.stadiamaps.com/sources_to_targets',
      expect.objectContaining({ costing: 'pedestrian' }),
      expect.any(Object),
    )
  })

  it('blocks outbound calls when redis rate limiter denies capacity', async () => {
    mockTryConsume.mockResolvedValueOnce(false)

    const provider = buildProvider()

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ServiceBusyError)
    }

    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('returns null distances for 404 responses', async () => {
    mockedPost.mockResolvedValueOnce({
      status: 404,
      data: {},
    })

    const provider = buildProvider()

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [
        { lat: -23.551, lon: -46.634 },
        { lat: -23.560, lon: -46.640 },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toEqual([
        { distance: null, status: 404 },
        { distance: null, status: 404 },
      ])
    }
  })

  it('handles partial null distances in matrix response', async () => {
    mockedPost.mockResolvedValueOnce({
      status: 200,
      data: {
        sources_to_targets: [
          [
            { distance: 2.5, time: 300 },
            { distance: null, time: null },
            { distance: 1.0, time: 120 },
          ],
        ],
      },
    })

    const provider = buildProvider()

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [
        { lat: -23.551, lon: -46.634 },
        { lat: -23.560, lon: -46.640 },
        { lat: -23.570, lon: -46.650 },
      ],
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.value).toEqual([
        { distance: 2.5, status: 0 },
        { distance: null, status: 0 },
        { distance: 1.0, status: 0 },
      ])
    }
  })
})
