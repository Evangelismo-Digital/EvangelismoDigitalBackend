import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StadiaChurchRoutingProvider } from './stadia-church-routing-provider'
import { STADIA_CONFIG } from 'messages/constants/providers/stadia'
import type Redis from 'ioredis'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ResilientChurchRoutingProviderDecorator } from './decorators/resilient-church-routing-provider.decorator'
import { IChurchRoutingProvider } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { Deadline } from 'core/shared/deadline'

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
        { lat: -23.56, lon: -46.64 },
      ],
      deadline: Deadline.in(Infinity, { linkedTo: new AbortController().signal }),
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
          { lat: -23.56, lon: -46.64 },
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
        sources_to_targets: [[{ distance: 2.5, time: 300 }]],
      },
    })

    const provider = buildProvider()
    const signal = new AbortController().signal

    const result = await provider.getDistances({
      origin: { lat: -23.5505, lon: -46.6333 },
      destinations: [{ lat: -23.551, lon: -46.634 }],
      deadline: Deadline.in(Infinity, { linkedTo: signal }),
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
        sources_to_targets: [[{ distance: 1.2, time: 150 }]],
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
        { lat: -23.56, lon: -46.64 },
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
        { lat: -23.56, lon: -46.64 },
        { lat: -23.57, lon: -46.65 },
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

  describe('raw matrix parsing (no decorator)', () => {
    function rawProvider(overrides: Record<string, unknown> = {}) {
      return new StadiaChurchRoutingProvider({
        matrixApiUrl: 'https://api.stadiamaps.com/sources_to_targets/',
        apiToken: 'test-token',
        defaultCosting: RoutingProfile.PEDESTRIAN,
        timeoutMs: 3000,
        ...overrides,
      })
    }

    const origin = { lat: -23.5505, lon: -46.6333 }
    const three = [
      { lat: -23.551, lon: -46.634 },
      { lat: -23.552, lon: -46.635 },
      { lat: -23.553, lon: -46.636 },
    ]

    it('identifies itself and honours the configured timeout', () => {
      expect(rawProvider().providerName).toBe('Stadia Maps')
      expect(rawProvider({ timeoutMs: 1234 }).timeoutMs).toBe(1234)
    })

    it('falls back to the default timeout when none is configured', () => {
      // `?? default`, not `&& default`: an explicit value must win.
      expect(rawProvider({ timeoutMs: undefined }).timeoutMs).toBe(STADIA_CONFIG.DEFAULT_TIMEOUT_MS)
    })

    it('survives a matrix whose first row is missing entirely', async () => {
      mockedPost.mockResolvedValueOnce({ status: 200, data: { sources_to_targets: [undefined] } })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.distance === null)).toBe(true)
    })

    it('maps each destination to its matrix entry, in order', async () => {
      mockedPost.mockResolvedValueOnce({
        status: 200,
        data: {
          sources_to_targets: [
            [
              { distance: 1, time: 1 },
              { distance: 2, time: 2 },
              { distance: 3, time: 3 },
            ],
          ],
        },
      })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: 1, status: 0 },
        { distance: 2, status: 0 },
        { distance: 3, status: 0 },
      ])
    })

    it('treats a null distance as unreachable rather than as a zero-length route', async () => {
      mockedPost.mockResolvedValueOnce({
        status: 200,
        data: {
          sources_to_targets: [
            [
              { distance: null, time: null },
              { distance: 7, time: 7 },
            ],
          ],
        },
      })

      const results = await rawProvider().fetchRawDistances(origin, three.slice(0, 2))

      expect(results[0]).toEqual({ distance: null, status: 0 })
      expect(results[1]).toEqual({ distance: 7, status: 0 })
    })

    it('returns one result per destination even when the row is short', async () => {
      // A provider that answers about fewer targets than we asked about must not
      // silently shorten the list — the caller zips it against its churches.
      mockedPost.mockResolvedValueOnce({
        status: 200,
        data: { sources_to_targets: [[{ distance: 1, time: 1 }]] },
      })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toHaveLength(3)
      expect(results[1]).toEqual({ distance: null, status: 0 })
      expect(results[2]).toEqual({ distance: null, status: 0 })
    })

    it('marks every destination unreachable on a 404', async () => {
      mockedPost.mockResolvedValueOnce({ status: 404, data: {} })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: null, status: 404 },
        { distance: null, status: 404 },
        { distance: null, status: 404 },
      ])
    })

    it('marks every destination unreachable when the matrix comes back empty', async () => {
      mockedPost.mockResolvedValueOnce({ status: 200, data: { sources_to_targets: [] } })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results.every((r) => r.distance === null && r.status === 404)).toBe(true)
    })

    it('survives a response with no body at all', async () => {
      mockedPost.mockResolvedValueOnce({ status: 200, data: undefined })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toHaveLength(3)
      expect(results.every((r) => r.distance === null)).toBe(true)
    })

    describe('costing resolution', () => {
      beforeEach(() => {
        mockedPost.mockResolvedValue({ status: 200, data: { sources_to_targets: [[{ distance: 1, time: 1 }]] } })
      })

      it('prefers an explicit profile', async () => {
        await rawProvider().fetchRawDistances(origin, [three[0]], RoutingProfile.BICYCLE)

        expect(mockedPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ costing: RoutingProfile.BICYCLE }),
          expect.anything(),
        )
      })

      it('falls back to the configured default', async () => {
        await rawProvider().fetchRawDistances(origin, [three[0]])

        expect(mockedPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ costing: RoutingProfile.PEDESTRIAN }),
          expect.anything(),
        )
      })

      it('falls back to AUTO when nothing is configured', async () => {
        await rawProvider({ defaultCosting: undefined }).fetchRawDistances(origin, [three[0]])

        expect(mockedPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ costing: RoutingProfile.AUTO }),
          expect.anything(),
        )
      })
    })

    describe('request contract', () => {
      beforeEach(() => {
        mockedPost.mockResolvedValue({ status: 200, data: { sources_to_targets: [[{ distance: 1, time: 1 }]] } })
      })

      it('strips a trailing slash from the matrix URL', async () => {
        await rawProvider().fetchRawDistances(origin, [three[0]])

        expect(mockedPost).toHaveBeenCalledWith(
          'https://api.stadiamaps.com/sources_to_targets',
          expect.anything(),
          expect.anything(),
        )
      })

      it('sends the origin as the single source and the churches as targets', async () => {
        await rawProvider().fetchRawDistances(origin, three)

        expect(mockedPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            sources: [{ lat: origin.lat, lon: origin.lon }],
            targets: three.map((d) => ({ lat: d.lat, lon: d.lon })),
          }),
          expect.anything(),
        )
      })

      it('authenticates and forwards the abort signal', async () => {
        const signal = new AbortController().signal

        await rawProvider().fetchRawDistances(origin, [three[0]], undefined, signal)

        expect(mockedPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            headers: expect.objectContaining({ Authorization: expect.stringContaining('test-token') }),
            signal,
          }),
        )
      })

      it('accepts a 404 as a valid status so it can be read as "unreachable"', async () => {
        await rawProvider().fetchRawDistances(origin, [three[0]])

        const config = mockedPost.mock.calls[0][2] as { validateStatus: (s: number) => boolean }
        expect(config.validateStatus(404)).toBe(true)
        expect(config.validateStatus(200)).toBe(true)
        expect(config.validateStatus(500)).toBe(false)
      })

      it('treats the 2xx range exactly — 199 and 300 are failures', async () => {
        await rawProvider().fetchRawDistances(origin, [three[0]])

        const config = mockedPost.mock.calls[0][2] as { validateStatus: (s: number) => boolean }
        expect(config.validateStatus(199)).toBe(false)
        expect(config.validateStatus(299)).toBe(true)
        expect(config.validateStatus(300)).toBe(false)
      })
    })
  })
})
