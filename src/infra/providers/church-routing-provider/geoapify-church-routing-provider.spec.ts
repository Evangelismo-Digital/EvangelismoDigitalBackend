import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockedPost } = vi.hoisted(() => ({ mockedPost: vi.fn() }))

vi.mock('@infra/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ post: mockedPost })),
}))

vi.mock('@infra/rate-limiter/redis-rate-limiter', () => ({
  EnumProviderConfig: { GEOAPIFY_ROUTING: 'geoapifyRoutingProvider' },
}))

import { GeoapifyChurchRoutingProvider } from './geoapify-church-routing-provider'
import { GEOAPIFY_CONFIG } from '@common/messages/constants/providers/geoapify'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { createHttpClient } from '@infra/http/axios'

const MATRIX_URL = 'https://api.geoapify.com/v1/routematrix'

function rawProvider(overrides: Record<string, unknown> = {}) {
  return new GeoapifyChurchRoutingProvider({
    matrixApiUrl: `${MATRIX_URL}/`,
    apiToken: 'geoapify-test-key',
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

/** One row of entries built from distances in meters (`undefined` = entry missing). */
function answer(metersRow: Array<number | null | undefined> | undefined, status = 200) {
  const row = metersRow?.map((distance, index) =>
    distance === undefined ? undefined : { distance, time: 1, source_index: 0, target_index: index },
  )

  mockedPost.mockResolvedValueOnce({ status, data: row === undefined ? undefined : { sources_to_targets: [row] } })
}

describe('GeoapifyChurchRoutingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('identity and resilience traits', () => {
    it('identifies itself and uses its own rate-limit bucket', () => {
      const provider = rawProvider()

      expect(provider.providerName).toBe('Geoapify')
      expect(provider.rateLimitConfig).toBe('geoapifyRoutingProvider')
      expect(provider.maxRetries).toBe(GEOAPIFY_CONFIG.MAX_RETRIES)
      expect(provider.backoffMs).toBe(GEOAPIFY_CONFIG.BACKOFF_MS)
      expect(provider.defaultCosting).toBe(RoutingProfile.PEDESTRIAN)
    })

    it('honours the configured timeout, on the provider and on its HTTP client', () => {
      expect(rawProvider({ timeoutMs: 1234 }).timeoutMs).toBe(1234)
      expect(createHttpClient).toHaveBeenLastCalledWith({ timeout: 1234 })
    })

    it('falls back to the default timeout when none is configured', () => {
      expect(rawProvider({ timeoutMs: undefined }).timeoutMs).toBe(GEOAPIFY_CONFIG.DEFAULT_TIMEOUT_MS)
    })
  })

  describe('request contract', () => {
    beforeEach(() => {
      answer([1000, 2000, 3000])
    })

    it('posts to the matrix URL without a trailing slash', async () => {
      await rawProvider().fetchRawDistances(origin, three)

      expect(mockedPost).toHaveBeenCalledWith(MATRIX_URL, expect.anything(), expect.anything())
    })

    it('sends the origin as the single source and the churches as targets, in [lon, lat] order', async () => {
      await rawProvider().fetchRawDistances(origin, three)

      expect(mockedPost.mock.calls[0][1]).toEqual({
        mode: 'walk',
        sources: [{ location: [origin.lon, origin.lat] }],
        targets: three.map((point) => ({ location: [point.lon, point.lat] })),
        units: 'metric',
      })
    })

    it('authenticates with the apiKey query parameter and forwards the abort signal', async () => {
      const signal = new AbortController().signal

      await rawProvider().fetchRawDistances(origin, three, undefined, signal)

      expect(mockedPost.mock.calls[0][2]).toEqual(
        expect.objectContaining({
          params: { apiKey: 'geoapify-test-key' },
          headers: { 'Content-Type': 'application/json' },
          signal,
        }),
      )
    })

    it('accepts 2xx and 404 only, so a 404 can be read as "unreachable"', async () => {
      await rawProvider().fetchRawDistances(origin, three)

      const { validateStatus } = mockedPost.mock.calls[0][2] as { validateStatus: (s: number) => boolean }

      expect([199, 200, 299, 300, 401, 404, 429, 500].map(validateStatus)).toEqual([
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

  describe('mode resolution', () => {
    beforeEach(() => {
      mockedPost.mockResolvedValue({ status: 200, data: { sources_to_targets: [[{ distance: 1 }]] } })
    })

    it.each([
      [RoutingProfile.PEDESTRIAN, 'walk'],
      [RoutingProfile.TRANSPORT, 'drive'],
    ])('routes the %s profile with the Geoapify %s mode', async (profile, mode) => {
      await rawProvider().fetchRawDistances(origin, [three[0]], profile)

      expect(mockedPost).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ mode }), expect.anything())
    })

    it('falls back to the configured default profile', async () => {
      await rawProvider({ defaultCosting: RoutingProfile.TRANSPORT }).fetchRawDistances(origin, [three[0]])

      expect(mockedPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'drive' }),
        expect.anything(),
      )
    })

    it('falls back to PEDESTRIAN (walk) when nothing is configured', async () => {
      await rawProvider({ defaultCosting: undefined }).fetchRawDistances(origin, [three[0]])

      expect(mockedPost).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ mode: 'walk' }),
        expect.anything(),
      )
    })
  })

  describe('reading the matrix', () => {
    it('converts each distance from meters to km, in destination order', async () => {
      answer([980, 3250, 10200])

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: 0.98, status: 0 },
        { distance: 3.25, status: 0 },
        { distance: 10.2, status: 0 },
      ])
    })

    it('treats a null distance as unreachable, but keeps a genuine zero-length route', async () => {
      answer([null, 3250, 0])

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: null, status: 0 },
        { distance: 3.25, status: 0 },
        { distance: 0, status: 0 },
      ])
    })

    it('treats a missing entry or a missing distance field as unreachable', async () => {
      mockedPost.mockResolvedValueOnce({
        status: 200,
        data: { sources_to_targets: [[undefined, { time: 5 }, { distance: 500 }]] },
      })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: null, status: 0 },
        { distance: null, status: 0 },
        { distance: 0.5, status: 0 },
      ])
    })

    it('returns one result per destination even when the row is short', async () => {
      answer([1000])

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual([
        { distance: 1, status: 0 },
        { distance: null, status: 0 },
        { distance: null, status: 0 },
      ])
    })

    it('marks every destination unreachable on a 404, whatever the body says', async () => {
      answer([1000, 2000, 3000], 404)

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual(three.map(() => ({ distance: null, status: 404 })))
    })

    it.each([
      ['no body at all', undefined],
      ['no sources_to_targets field', {}],
      ['no rows', { sources_to_targets: [] }],
      ['a missing first row', { sources_to_targets: [undefined] }],
    ])('marks every destination unreachable when the matrix has %s', async (_label, data) => {
      mockedPost.mockResolvedValueOnce({ status: 200, data })

      const results = await rawProvider().fetchRawDistances(origin, three)

      expect(results).toEqual(three.map(() => ({ distance: null, status: 404 })))
    })
  })
})
