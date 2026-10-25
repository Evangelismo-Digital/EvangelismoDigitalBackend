import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Regression: **every nearest-church lookup answered 503 while the first
 * routing provider refused the matrix call.**
 *
 * Routing had a single provider, Stadia. When the Stadia plan stopped including
 * `/sources_to_targets` it answered `403 — Account does not have access to this
 * endpoint`; that maps to the RETRYABLE `ProviderFailureError`, but with no
 * second provider there was nowhere to fall through to, so
 * `GET /churches/nearest` returned `503 SERVICE_UNAVAILABLE` for every CEP even
 * though geocoding had already succeeded. Defect: Stadia 403 → nearest churches
 * 503 (2026-10-15).
 *
 * Stadia has since been dropped (2026-10-25) and the chain is Geoapify →
 * OpenRouteService, so the guard now applies to whichever provider leads it: a
 * 403/401/429 from the first one must fall through, not end the search.
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
import { isErr, isOk } from '@common/utils/result'

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

const isGeoapify = (url: string) => url.startsWith(env.GEOAPIFY_ROUTE_MATRIX_API_URL)
const isOrs = (url: string) => url.startsWith(env.OPENROUTESERVICE_MATRIX_API_URL)

/** Geoapify's envelope: meters, one row per source. */
const GEOAPIFY_ANSWER = { status: 200, data: { sources_to_targets: [[{ distance: 980 }, { distance: 3250 }]] } }
/** ORS's envelope: already in km. */
const ORS_ANSWER = { status: 200, data: { distances: [[1.5, 2.5]] } }

function calledUrls(): string[] {
  return mockPost.mock.calls.map(([url]) => url as string)
}

function resetMocks() {
  vi.clearAllMocks()
  resetProviderCircuitBreakers()
  mockTryConsume.mockResolvedValue(true)
}

describe('Regression: nearest churches answered 503 when the first routing provider rejected the matrix call', () => {
  beforeEach(resetMocks)

  it.each([403, 401, 429])('falls through to OpenRouteService when Geoapify answers %i', async (status) => {
    mockPost.mockImplementation((url: string) =>
      isGeoapify(url) ? Promise.reject(rejects(url, status)) : Promise.resolve(ORS_ANSWER),
    )

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result) && result.value).toEqual([
      { distance: 1.5, status: 0 },
      { distance: 2.5, status: 0 },
    ])
    expect(calledUrls().some(isOrs)).toBe(true)
  })

  it('asks only Geoapify when Geoapify answers', async () => {
    // Counterweight: the fallback must not turn into "always call both", which
    // would spend the fallback's daily quota on every request.
    mockPost.mockResolvedValue(GEOAPIFY_ANSWER)

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result) && result.value).toEqual([
      { distance: 0.98, status: 0 },
      { distance: 3.25, status: 0 },
    ])
    expect(calledUrls()).toEqual([env.GEOAPIFY_ROUTE_MATRIX_API_URL])
  })
})
