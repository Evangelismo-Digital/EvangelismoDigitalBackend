import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StadiaChurchRoutingProvider } from './stadia-church-routing-provider'
import type Redis from 'ioredis'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

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

class InMemoryRedisMock {
  private readonly store = new Map<string, string>()

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null
  }

  async set(key: string, value: string, ..._args: unknown[]): Promise<'OK'> {
    this.store.set(key, value)
    return 'OK'
  }
}

function buildProvider(): StadiaChurchRoutingProvider {
  const redis = new InMemoryRedisMock() as unknown as Redis

  return new StadiaChurchRoutingProvider(
    {
      apiUrl: 'https://api.stadiamaps.com/route/v1/',
      apiToken: 'test-token',
      defaultCosting: RoutingProfile.PEDESTRIAN,
      timeoutMs: 2500,
    },
    redis,
    redis,
    {
      prefix: 'cache:test:stadia:',
      defaultTtlSeconds: 60,
      negativeTtlSeconds: 0,
      maxPendingFetches: 20,
      fetchTimeoutMs: 2500,
    },
  )
}

describe('StadiaChurchRoutingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTryConsume.mockResolvedValue(true)
  })

  it('uses default costing and forwards abort signal to HTTP request', async () => {
    mockedPost.mockResolvedValueOnce({
      data: {
        status: 0,
        routes: [{ summary: { length: 2.5 } }],
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
        directions_options: { units: 'kilometers' },
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
      data: {
        status: 0,
        distance: 1.2,
      },
    })

    const provider = buildProvider()

    await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
      profile: RoutingProfile.PEDESTRIAN,
    })

    expect(mockedPost).toHaveBeenCalledWith(
      'https://api.stadiamaps.com/route/v1',
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

  it('coalesces concurrent identical route lookups into a single outbound request', async () => {
    mockedPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              data: {
                status: 0,
                distance: 1.2,
              },
            })
          }, 20)
        }),
    )

    const provider = buildProvider()
    const params = {
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
      profile: RoutingProfile.PEDESTRIAN,
    }

    const [first, second] = await Promise.all([provider.getDistances(params), provider.getDistances(params)])

    expect(first.success).toBe(true)
    expect(second.success).toBe(true)
    if (first.success && second.success) {
      expect(first.value).toEqual([{ distance: 1.2, status: 0 }])
      expect(second.value).toEqual([{ distance: 1.2, status: 0 }])
    }
    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockTryConsume).toHaveBeenCalledTimes(1)
  })
})
