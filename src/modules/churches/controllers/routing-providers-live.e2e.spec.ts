import { app } from 'app'
import request from 'supertest'
import { execFileSync } from 'node:child_process'
import type Redis from 'ioredis'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@config/env/index'
import { createRedisCacheConnection } from '@infra/redis/connections/redis-cache-connection'
import { RedisRateLimiter } from '@infra/rate-limiter/redis-rate-limiter'
import { resetProviderCircuitBreakers } from '@infra/providers/helpers/provider-circuit-breaker'
import { GeoapifyChurchRoutingProvider } from '@infra/providers/church-routing-provider/geoapify-church-routing-provider'
import { OpenRouteServiceChurchRoutingProvider } from '@infra/providers/church-routing-provider/openrouteservice-church-routing-provider'
import { ResilientChurchRoutingProviderDecorator } from '@infra/providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { IRawChurchRoutingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { RouteDistanceResult } from '@infra/providers/interfaces/church-routing-provider.interface'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { isErr, isOk } from '@common/utils/result'

// ATENÇÃO: esta suíte faz chamadas REAIS às APIs de matriz de rotas (Geoapify,
// OpenRouteService) e de endereço/geocodificação. Ela tem um projeto próprio
// (`npm run test:e2e:routing-providers-live`) e fica FORA do CI de propósito:
// gasta cota dos provedores e depende de terceiros estarem no ar.
//
// PRÉ-REQUISITOS:
// 1. Tokens REAIS em `.env.test.local` (gitignored): GEOAPIFY_API_TOKEN,
//    OPENROUTESERVICE_API_TOKEN, AWESOME_API_TOKEN e LOCATION_IQ_API_TOKEN. O
//    `.env.test` versionado traz tokens falsos.
// 2. Docker com Postgres/Redis no ar. A suíte roda o seed antes de começar (as
//    outras suítes e2e truncam o schema `public`, e o seed é a fonte das igrejas).

const redisConnection = createRedisCacheConnection()

/** Icaraí, Niterói — where most seeded churches are. */
const CEP_NITEROI = '24210-201'
/** Centro, Niterói — the other side of Guanabara Bay from the Catedral. */
const CEP_NITEROI_CENTRO = '24020-085'
/** Avenida Paulista, São Paulo — ~326 km from the nearest seeded church. */
const CEP_SAO_PAULO = '01310-100'
/** Inside Rio Grande do Sul's range; BrasilAPI "finds" it in Sarandi/PR. */
const CEP_FAKE = '99999999'

const origin = { lat: -22.9113709, lon: -43.1054179 }
const destinations = [
  { lat: -22.905555, lon: -43.108653 },
  { lat: -22.901485, lon: -43.12753 },
]

const LIVE_TIMEOUT_MS = 30_000

function liveProviders(): Record<'geoapify' | 'ors', IRawChurchRoutingProvider> {
  return {
    geoapify: new GeoapifyChurchRoutingProvider({
      matrixApiUrl: env.GEOAPIFY_ROUTE_MATRIX_API_URL,
      apiToken: env.GEOAPIFY_API_TOKEN,
      defaultCosting: RoutingProfile.PEDESTRIAN,
    }),
    ors: new OpenRouteServiceChurchRoutingProvider({
      matrixApiUrl: env.OPENROUTESERVICE_MATRIX_API_URL,
      apiToken: env.OPENROUTESERVICE_API_TOKEN,
      defaultCosting: RoutingProfile.PEDESTRIAN,
    }),
  }
}

async function routeWith(raw: IRawChurchRoutingProvider, profile: RoutingProfile) {
  return await new ResilientChurchRoutingProviderDecorator(raw, {} as Redis).getDistances({
    origin,
    destinations,
    profile,
  })
}

function kmOf(rows: RouteDistanceResult[]): number[] {
  return rows.map((row) => {
    expect(row.status).toBe(0)
    expect(typeof row.distance).toBe('number')

    return row.distance as number
  })
}

/** Both destinations sit 0.5–6 km from the origin, whichever way you travel. */
function expectPlausibleKm(distances: number[]) {
  expect(distances).toHaveLength(destinations.length)
  for (const km of distances) {
    expect(km).toBeGreaterThan(0.3)
    expect(km).toBeLessThan(6)
  }
}

function upstreamFailure(status: number) {
  const config = { url: env.GEOAPIFY_ROUTE_MATRIX_API_URL, headers: new AxiosHeaders() }

  return new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, undefined, {
    status,
    statusText: '',
    data: { error: 'forced by the live suite' },
    headers: {},
    config,
  })
}

interface NearestBody {
  mode: string
  totalFound: number
  nearestChurchesInfo: Array<{ name: string; address: string; distanceKm: number }>
}

function expectRankedWithin(body: NearestBody, maxKm: number) {
  const distances = body.nearestChurchesInfo.map((church) => church.distanceKm)

  expect(distances.length).toBeGreaterThan(0)
  // The churches returned, not the KNN candidates routing started from.
  expect(body.totalFound).toBe(distances.length)
  expect(distances.every((km) => km > 0 && km <= maxKm)).toBe(true)
  expect(distances).toEqual([...distances].sort((a, b) => a - b))
}

/** The `Cidade - UF` tail of each address (`Rua, nº - Bairro, Cidade - UF`). */
function cities(body: NearestBody): string[] {
  return body.nearestChurchesInfo.map((church) => church.address.split(', ').at(-1) ?? '')
}

async function nearest(query: Record<string, string>) {
  return await request(app.server).get('/churches/nearest').query(query)
}

describe('Live routing providers and routing mode (e2e, real APIs)', () => {
  beforeAll(async () => {
    execFileSync('npx', ['prisma', 'db', 'seed'], { stdio: 'ignore', env: process.env })

    await app.ready()
  }, 120_000)

  afterAll(async () => {
    await app.close()
    await redisConnection.quit()
  })

  beforeEach(async () => {
    vi.restoreAllMocks()
    resetProviderCircuitBreakers()

    // The outbound quota buckets are not under test here; the providers' own
    // limits are what a real 429 would exercise.
    vi.spyOn(RedisRateLimiter.prototype, 'tryConsume').mockResolvedValue(true)

    const keys = await redisConnection.keys('cache:*')
    if (keys.length > 0) {
      await redisConnection.del(...keys)
    }
  })

  describe('each provider, called live', () => {
    it(
      'geoapify answers both modes with plausible, mode-specific distances',
      async () => {
        const raw = liveProviders().geoapify

        const walking = await routeWith(raw, RoutingProfile.PEDESTRIAN)
        const driving = await routeWith(raw, RoutingProfile.TRANSPORT)

        // Only the error's own label: the AxiosError underneath carries the
        // request config, credentials included.
        expect(isOk(walking) ? 'ok' : walking.error.name).toBe('ok')
        expect(isOk(driving) ? 'ok' : driving.error.name).toBe('ok')
        if (isErr(walking) || isErr(driving)) return

        const walkKm = kmOf(walking.value)
        const driveKm = kmOf(driving.value)

        expectPlausibleKm(walkKm)
        expectPlausibleKm(driveKm)
        // The mode really reaches the vendor: a car follows one-way streets and
        // avenues, so at least one route differs from the walking one.
        expect(driveKm).not.toEqual(walkKm)
      },
      LIVE_TIMEOUT_MS,
    )

    // ORS is currently refusing the account (403 "Access to this API has been
    // disallowed") and may come back at any time, so it is not required to
    // answer — but when it fails it must fail RETRYABLE, so the chain reports
    // an outage instead of a fake "nothing nearby".
    it(
      'openrouteservice either answers with plausible distances or fails RETRYABLE',
      async () => {
        for (const profile of [RoutingProfile.PEDESTRIAN, RoutingProfile.TRANSPORT]) {
          const result = await routeWith(liveProviders().ors, profile)

          if (isOk(result)) {
            expectPlausibleKm(kmOf(result.value))
          } else {
            expect(result.error.failureMode).toBe(FailureMode.RETRYABLE)
          }
        }
      },
      LIVE_TIMEOUT_MS,
    )
  })

  describe('GET /churches/nearest, end to end', () => {
    it(
      'walks by default, within the 10 km cap, asking Geoapify and nothing else',
      async () => {
        const ors = vi.spyOn(OpenRouteServiceChurchRoutingProvider.prototype, 'fetchRawDistances')

        const response = await nearest({ cep: CEP_NITEROI })

        expect(response.statusCode).toBe(200)
        expect(response.body.mode).toBe(RoutingProfile.PEDESTRIAN)
        expectRankedWithin(response.body as NearestBody, 10)
        expect(ors).not.toHaveBeenCalled()
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'routes by vehicle when asked, within the 150 km transport cap',
      async () => {
        const response = await nearest({ cep: CEP_NITEROI, mode: RoutingProfile.TRANSPORT })

        expect(response.statusCode).toBe(200)
        expect(response.body.mode).toBe(RoutingProfile.TRANSPORT)
        expectRankedWithin(response.body as NearestBody, 150)
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'never walks across Guanabara Bay: on foot from Niterói Centro only Niterói churches come back',
      async () => {
        const walking = await nearest({ cep: CEP_NITEROI_CENTRO })
        const driving = await nearest({ cep: CEP_NITEROI_CENTRO, mode: RoutingProfile.TRANSPORT })

        expect(walking.statusCode).toBe(200)
        expect(cities(walking.body as NearestBody).every((city) => city === 'Niterói - RJ')).toBe(true)
        // Counterweight: by car the bridge makes Rio reachable, so what filters
        // Rio out on foot is the ferry, not the city.
        expect(cities(driving.body as NearestBody)).toContain('Rio de Janeiro - RJ')
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'answers NO_NEARBY_CHURCHES_FOUND, not 503, for a far CEP on foot — without routing',
      async () => {
        const geoapify = vi.spyOn(GeoapifyChurchRoutingProvider.prototype, 'fetchRawDistances')

        const response = await nearest({ cep: CEP_SAO_PAULO })

        expect(response.statusCode).toBe(404)
        expect(response.body.code).toBe('NO_NEARBY_CHURCHES_FOUND')
        expect(geoapify).not.toHaveBeenCalled()
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'answers INVALID_CEP, not 503, for a CEP BrasilAPI places in the wrong state',
      async () => {
        const response = await nearest({ cep: CEP_FAKE })

        expect(response.statusCode).toBe(404)
        expect(response.body.code).toBe('INVALID_CEP')
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'falls through to ORS when Geoapify fails, and reports the outage if ORS is down too',
      async () => {
        vi.spyOn(GeoapifyChurchRoutingProvider.prototype, 'fetchRawDistances').mockRejectedValue(upstreamFailure(503))
        const ors = vi.spyOn(OpenRouteServiceChurchRoutingProvider.prototype, 'fetchRawDistances')

        const response = await nearest({ cep: CEP_NITEROI, mode: RoutingProfile.TRANSPORT })

        expect(ors).toHaveBeenCalled()
        if (response.statusCode === 200) {
          expectRankedWithin(response.body as NearestBody, 150)
        } else {
          expect(response.statusCode).toBe(503)
          expect(response.body.code).toBe('SERVICE_UNAVAILABLE')
        }
      },
      LIVE_TIMEOUT_MS,
    )

    it('rejects an unknown mode with VALIDATION_ERROR before calling any provider', async () => {
      const geoapify = vi.spyOn(GeoapifyChurchRoutingProvider.prototype, 'fetchRawDistances')

      const response = await nearest({ cep: CEP_NITEROI, mode: 'bicycle' })

      expect(response.statusCode).toBe(400)
      expect(response.body.code).toBe('VALIDATION_ERROR')
      expect(geoapify).not.toHaveBeenCalled()
    })
  })
})
