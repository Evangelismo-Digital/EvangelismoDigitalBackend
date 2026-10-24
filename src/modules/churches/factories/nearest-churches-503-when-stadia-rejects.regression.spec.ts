import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Regression: **every nearest-church lookup answered 503 while Stadia refused
 * the matrix call.**
 *
 * Routing had a single provider. When the Stadia account's plan did not include
 * `/sources_to_targets`, Stadia answered `403 — Account does not have access to
 * this endpoint`; that maps to the RETRYABLE `ProviderFailureError`, but with no
 * second provider there was nowhere to fall through to, so
 * `GET /churches/nearest` returned `503 SERVICE_UNAVAILABLE` for every CEP even
 * though geocoding had already succeeded. The same happened for an invalid
 * token (401), a quota (429) or a Stadia outage.
 *
 * The routing stack is now a chain — Stadia, then OpenRouteService — assembled
 * by `makeChurchRoutingProvider`. Defect: Stadia 403 → nearest churches 503
 * (2026-10-15).
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

const origin = { lat: -22.9113709, lon: -43.1054179 }
const destinations = [
  { lat: -22.905555, lon: -43.108653 },
  { lat: -22.901485, lon: -43.12753 },
]

function stadiaRejects(status: number, body: unknown) {
  const config = { url: env.STADIA_MAPS_MATRIX_API_URL, headers: new AxiosHeaders() }

  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, undefined, {
    status,
    statusText: '',
    data: body,
    headers: {},
    config,
  })
}

function isStadiaCall(url: string): boolean {
  return url.startsWith(env.STADIA_MAPS_MATRIX_API_URL)
}

describe('Regression: nearest churches answered 503 when Stadia rejected the matrix call', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetProviderCircuitBreakers()
    mockTryConsume.mockResolvedValue(true)
  })

  it('falls through to OpenRouteService when Stadia answers 403 (plan without matrix access)', async () => {
    mockPost.mockImplementation((url: string) =>
      isStadiaCall(url)
        ? Promise.reject(
            stadiaRejects(403, {
              error: 'Account does not have access to this endpoint. Please upgrade your account.',
            }),
          )
        : Promise.resolve({ status: 200, data: { distances: [[0.98, 3.25]] } }),
    )

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result) && result.value).toEqual([
      { distance: 0.98, status: 0 },
      { distance: 3.25, status: 0 },
    ])
    expect(mockPost).toHaveBeenCalledWith(
      `${env.OPENROUTESERVICE_MATRIX_API_URL.replace(/\/$/, '')}/foot-walking`,
      expect.anything(),
      expect.anything(),
    )
  })

  it('still asks Stadia first, and only Stadia, when Stadia answers', async () => {
    // Counterweight: the fallback must not turn into "always call both", which
    // would spend the 500/day ORS quota on every request.
    mockPost.mockResolvedValue({
      status: 200,
      data: {
        sources_to_targets: [
          [
            { distance: 1.5, time: 1 },
            { distance: 2.5, time: 2 },
          ],
        ],
      },
    })

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result) && result.value).toEqual([
      { distance: 1.5, status: 0 },
      { distance: 2.5, status: 0 },
    ])
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(isStadiaCall(mockPost.mock.calls[0][0] as string)).toBe(true)
  })
})
