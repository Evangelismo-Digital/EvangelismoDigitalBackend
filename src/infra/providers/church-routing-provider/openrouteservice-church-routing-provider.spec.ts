import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedPost } = vi.hoisted(() => ({ mockedPost: vi.fn() }))

vi.mock('@infra/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ post: mockedPost })),
}))

vi.mock('@infra/rate-limiter/redis-rate-limiter', () => ({
  EnumProviderConfig: { OPENROUTESERVICE_ROUTING: 'openRouteServiceRoutingProvider' },
}))

import { OpenRouteServiceChurchRoutingProvider } from './openrouteservice-church-routing-provider'
import { OPENROUTESERVICE_CONFIG } from '@common/messages/constants/providers/openrouteservice'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { createHttpClient } from '@infra/http/axios'

const BASE_URL = 'https://api.openrouteservice.org/v2/matrix'

function rawProvider(overrides: Record<string, unknown> = {}) {
  return new OpenRouteServiceChurchRoutingProvider({
    matrixApiUrl: `${BASE_URL}/`,
    apiToken: 'ors-test-token',
    defaultCosting: RoutingProfile.PEDESTRIAN,
    timeoutMs: 3000,
    ...overrides,
  })
}

const origin = { lat: -22.9113709, lon: -43.1054179 }
const three = [
  { lat: -22.905555, lon: -43.108653 },
  { lat: -22.901485, lon: -43.12753 },
  { lat: -22.907961, lon: -43.181362 },
]

function answer(distances: unknown, status = 200) {
  mockedPost.mockResolvedValueOnce({ status, data: distances === undefined ? undefined : { distances } })
}

describe('OpenRouteServiceChurchRoutingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('identity and resilience traits', () => {
    it('identifies itself and uses its own rate-limit bucket', () => {
      const provider = rawProvider()

      expect(provider.providerName).toBe('OpenRouteService')
      expect(provider.rateLimitConfig).toBe('openRouteServiceRoutingProvider')
      expect(provider.maxRetries).toBe(OPENROUTESERVICE_CONFIG.MAX_RETRIES)
      expect(provider.backoffMs).toBe(OPENROUTESERVICE_CONFIG.BACKOFF_MS)
      expect(provider.defaultCosting).toBe(RoutingProfile.PEDESTRIAN)
    })

    it('honours the configured timeout, on the provider and on its HTTP client', () => {
      expect(rawProvider({ timeoutMs: 1234 }).timeoutMs).toBe(1234)
      expect(createHttpClient).toHaveBeenLastCalledWith({ timeout: 1234 })
    })

    it('falls back to the default timeout when none is configured', () => {
      expect(rawProvider({ timeoutMs: undefined }).timeoutMs).toBe(OPENROUTESERVICE_CONFIG.DEFAULT_TIMEOUT_MS)
    })
  })

  describe('request contract', () => {
    beforeEach(() => {
      mockedPost.mockResolvedValue({ status: 200, data: { distances: [[1, 2, 3]] } })
    })

    it('posts to the profile path, without a doubled slash', async () => {
      await rawProvider().fetchRawDistances(origin, three)

      expect(mockedPost).toHaveBeenCalledWith(`${BASE_URL}/foot-walking`, expect.anything(), expect.anything())
    })

    it('sends [lon, lat] pairs with the origin first, as the single source', async () => {
      await rawProvider().fetchRawDistances(origin, three)

      expect(mockedPost.mock.calls[0][1]).toEqual({
        locations: [
          [origin.lon, origin.lat],
          [three[0].lon, three[0].lat],
          [three[1].lon, three[1].lat],
          [three[2].lon, three[2].lat],
        ],
        sources: [0],
        destinations: [1, 2, 3],
        metrics: ['distance'],
        units: 'km',
      })
    })

    it('authenticates with the bare key and forwards the abort signal', async () => {
      const signal = new AbortController().signal

      await rawProvider().fetchRawDistances(origin, three, undefined, signal)

      expect(mockedPost.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          headers: { Authorization: 'ors-test-token', 'Content-Type': 'application/json' },
          signal,
        }),
      )
    })

    it('accepts 2xx and 404 only, so a 404 can be read as "unreachable"', async () => {
      await rawProvider().fetchRawDistances(origin, three)

      const { validateStatus } = mockedPost.mock.calls[0][2] as { validateStatus: (s: number) => boolean }

      expect([199, 200, 299, 300, 403, 404, 429, 500].map(validateStatus)).toEqual([
        false,
        true,
        true,
        false,
        false,
        true,
        false,
        false,
      ])
    })
  })

  describe('profile resolution', () => {
    beforeEach(() => {
      mockedPost.mockResolvedValue({ status: 200, data: { distances: [[1]] } })
    })

    it.each([
      [RoutingProfile.PEDESTRIAN, 'foot-walking'],
      [RoutingProfile.BICYCLE, 'cycling-regular'],
      [RoutingProfile.BIKESHARE, 'cycling-regular'],
      [RoutingProfile.AUTO, 'driving-car'],
      [RoutingProfile.TAXI, 'driving-car'],
      [RoutingProfile.BUS, 'driving-car'],
      [RoutingProfile.MOTORCYCLE, 'driving-car'],
      [RoutingProfile.MOTOR_SCOOTER, 'driving-car'],
      [RoutingProfile.LOW_SPEED_VEHICLE, 'driving-car'],
      [RoutingProfile.TRUCK, 'driving-hgv'],
    ])('routes the %s costing with the ORS %s profile', async (costing, orsProfile) => {
      await rawProvider().fetchRawDistances(origin, [three[0]], costing)

      expect(mockedPost).toHaveBeenCalledWith(`${BASE_URL}/${orsProfile}`, expect.anything(), expect.anything())
    })

    it('falls back to the configured default costing', async () => {
      await rawProvider({ defaultCosting: RoutingProfile.BICYCLE }).fetchRawDistances(origin, [three[0]])

      expect(mockedPost).toHaveBeenCalledWith(`${BASE_URL}/cycling-regular`, expect.anything(), expect.anything())
    })

    it('falls back to AUTO (driving-car) when nothing is configured', async () => {
      await rawProvider({ defaultCosting: undefined }).fetchRawDistances(origin, [three[0]])

      expect(mockedPost).toHaveBeenCalledWith(`${BASE_URL}/driving-car`, expect.anything(), expect.anything())
    })
  })

  describe('reading the matrix', () => {
    it('maps each destination to its distance in km, in order', async () => {
      answer([[0.98, 3.25, 10.2]])

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: 0.98, status: 0 },
        { distance: 3.25, status: 0 },
        { distance: 10.2, status: 0 },
      ])
    })

    it('treats a null distance as unreachable rather than as a zero-length route', async () => {
      // Taken from a live answer: a point ORS cannot snap to the road graph.
      answer([[null, 3.25, 0]])

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: null, status: 0 },
        { distance: 3.25, status: 0 },
        { distance: 0, status: 0 },
      ])
    })

    it('returns one result per destination even when the row is short', async () => {
      answer([[1]])

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: 1, status: 0 },
        { distance: null, status: 0 },
        { distance: null, status: 0 },
      ])
    })

    it('marks every destination unreachable on a 404, whatever the body says', async () => {
      answer([[1, 2, 3]], 404)

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: null, status: 404 },
        { distance: null, status: 404 },
        { distance: null, status: 404 },
      ])
    })

    it.each([
      ['no body at all', undefined],
      ['no rows', []],
      ['a missing first row', [undefined]],
    ])('marks every destination unreachable when the matrix has %s', async (_label, distances) => {
      if (distances === undefined) {
        mockedPost.mockResolvedValueOnce({ status: 200, data: undefined })
      } else {
        answer(distances)
      }

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual(three.map(() => ({ distance: null, status: 404 })))
    })

    it('marks every destination unreachable when the body has no distances field', async () => {
      mockedPost.mockResolvedValueOnce({ status: 200, data: {} })

      const results = await rawProvider().fetchRawDistances(origin, [three[0]])

      expect(results).toEqual([{ distance: null, status: 404 }])
    })
  })
})
