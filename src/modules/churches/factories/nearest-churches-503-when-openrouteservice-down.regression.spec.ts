import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Regression: **nearest-church lookups answered 503 while OpenRouteService was
 * down.**
 *
 * The routing chain was Stadia → OpenRouteService. ORS went down on its own
 * side (a PHP failure answering 5xx), so whenever Stadia also failed with a
 * RETRYABLE error the chain ran out of providers and `GET /churches/nearest`
 * returned `503 SERVICE_UNAVAILABLE`, even though geocoding had succeeded.
 *
 * Geoapify now sits between them (Stadia → Geoapify → ORS). Defect: ORS outage
 * → nearest churches 503 (2026-10-25).
 *
 * This drives the real wiring (decorators, retry policy, error mapper, chain)
 * with only the HTTP client and the rate limiter replaced.
 */

const { mockPost, mockTryConsume } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockTryConsume: vi.fn(),
}))

vi.mock('@infra/http/axios', () => ({
  createHttpClient: vi.fn(() => ({ post: mockPost })),
}))

vi.mock('@infra/rate-limiter/redis-rate-limiter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@infra/rate-limiter/redis-rate-limiter')>()),
  RedisRateLimiter: { getInstance: vi.fn(() => ({ tryConsume: mockTryConsume })) },
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import type Redis from 'ioredis'
import { AxiosError, AxiosHeaders } from 'axios'
import { makeChurchRoutingProvider } from './make-find-nearest-churches.service'
import { resetProviderCircuitBreakers } from '@infra/providers/helpers/provider-circuit-breaker'
import { env } from '@config/env/index'
import { isOk } from '@common/utils/result'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'

const origin = { lat: -22.9113709, lon: -43.1054179 }
const destinations = [
  { lat: -22.905555, lon: -43.108653 },
  { lat: -22.901485, lon: -43.12753 },
]

function rejects(url: string, status: number) {
  const config = { url, headers: new AxiosHeaders() }

  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, undefined, {
    status,
    statusText: '',
    data: { error: 'upstream failure' },
    headers: {},
    config,
  })
}

const isStadia = (url: string) => url.startsWith(env.STADIA_MAPS_MATRIX_API_URL)
const isGeoapify = (url: string) => url.startsWith(env.GEOAPIFY_ROUTE_MATRIX_API_URL)
const isOrs = (url: string) => url.startsWith(env.OPENROUTESERVICE_MATRIX_API_URL)

function calledUrls(): string[] {
  return mockPost.mock.calls.map(([url]) => url as string)
}

describe('Regression: nearest churches answered 503 while OpenRouteService was down', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
    mockTryConsume.mockResolvedValue(true)
  })

  it('answers from Geoapify when Stadia fails and ORS is down, without asking ORS', async () => {
    mockPost.mockImplementation((url: string) =>
      isGeoapify(url)
        ? Promise.resolve({ status: 200, data: { sources_to_targets: [[{ distance: 980 }, { distance: 3250 }]] } })
        : Promise.reject(rejects(url, isStadia(url) ? 403 : 500)),
    )

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({
      origin,
      destinations,
      profile: RoutingProfile.TRANSPORT,
    })

    expect(isOk(result) && result.value).toEqual([
      { distance: 0.98, status: 0 },
      { distance: 3.25, status: 0 },
    ])
    expect(mockPost).toHaveBeenCalledWith(
      env.GEOAPIFY_ROUTE_MATRIX_API_URL,
      expect.objectContaining({ mode: 'drive' }),
      expect.anything(),
    )
    expect(calledUrls().some(isOrs)).toBe(false)
  })

  it('still falls through to ORS when Stadia and Geoapify both fail', async () => {
    // Counterweight: Geoapify must not have replaced ORS — once ORS recovers it
    // is the last line of defence again.
    mockPost.mockImplementation((url: string) =>
      isOrs(url)
        ? Promise.resolve({ status: 200, data: { distances: [[1.5, 2.5]] } })
        : Promise.reject(rejects(url, 429)),
    )

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result) && result.value).toEqual([
      { distance: 1.5, status: 0 },
      { distance: 2.5, status: 0 },
    ])
    expect(calledUrls().some(isStadia)).toBe(true)
    expect(calledUrls().some(isGeoapify)).toBe(true)
    expect(calledUrls().some(isOrs)).toBe(true)
  })
})
