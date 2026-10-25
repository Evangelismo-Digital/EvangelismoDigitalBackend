import { vi, describe, it, expect, beforeEach } from 'vitest'

/**
 * Regression: **every nearest-church search wasted an attempt on Stadia.**
 *
 * Stadia's plan stopped serving the matrix endpoint: it answered `403 — Please
 * upgrade your account` to every request. Because it led the routing chain,
 * each search spent its retries on Stadia (~250 ms) before Geoapify answered —
 * found by the frontend's real-backend suite. Defect: Stadia 403 on every
 * search, Stadia dropped from routing (2026-10-25).
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

describe('Regression: every nearest-church search wasted an attempt on Stadia', () => {
  beforeEach(resetMocks)

  it('makes exactly one routing call, to Geoapify, on the happy path', async () => {
    mockPost.mockResolvedValue(GEOAPIFY_ANSWER)

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result)).toBe(true)
    expect(calledUrls()).toEqual([env.GEOAPIFY_ROUTE_MATRIX_API_URL])
    expect(calledUrls().some((url) => url.includes('stadiamaps'))).toBe(false)
  })

  it('still has a fallback behind Geoapify', async () => {
    // Counterweight: dropping Stadia must not leave routing with one provider,
    // which is exactly the 503-on-every-search defect of 2026-10-15.
    mockPost.mockImplementation((url: string) =>
      isGeoapify(url) ? Promise.reject(rejects(url, 503)) : Promise.resolve(ORS_ANSWER),
    )

    const result = await makeChurchRoutingProvider({} as Redis).getDistances({ origin, destinations })

    expect(isOk(result)).toBe(true)
    expect(calledUrls().some(isOrs)).toBe(true)
  })
})
