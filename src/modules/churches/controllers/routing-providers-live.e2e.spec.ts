import { app } from 'app'
import request from 'supertest'
import { execFileSync } from 'node:child_process'
import type Redis from 'ioredis'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { env } from '@config/env/index'
import { prisma } from '@infra/database/prisma'
import { createRedisCacheConnection } from '@infra/redis/connections/redis-cache-connection'
import { RedisRateLimiter } from '@infra/rate-limiter/redis-rate-limiter'
import { resetProviderCircuitBreakers } from '@infra/providers/helpers/provider-circuit-breaker'
import { StadiaChurchRoutingProvider } from '@infra/providers/church-routing-provider/stadia-church-routing-provider'
import { GeoapifyChurchRoutingProvider } from '@infra/providers/church-routing-provider/geoapify-church-routing-provider'
import { OpenRouteServiceChurchRoutingProvider } from '@infra/providers/church-routing-provider/openrouteservice-church-routing-provider'
import { ResilientChurchRoutingProviderDecorator } from '@infra/providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { IRawChurchRoutingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { RouteDistanceResult } from '@infra/providers/interfaces/church-routing-provider.interface'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { isErr, isOk } from '@common/utils/result'

// ATENÇÃO: esta suíte faz chamadas REAIS às APIs de matriz de rotas (Stadia,
// Geoapify, OpenRouteService) e de geocodificação. Ela tem um projeto próprio
// (`npm run test:e2e:routing-providers-live`) e fica FORA do CI de propósito:
// gasta cota dos provedores e depende de terceiros estarem no ar.
//
// PRÉ-REQUISITOS:
// 1. Tokens REAIS em `.env.test.local` (gitignored): STADIA_API_TOKEN,
//    GEOAPIFY_API_TOKEN, OPENROUTESERVICE_API_TOKEN, AWESOME_API_TOKEN e
//    LOCATION_IQ_API_TOKEN. O `.env.test` versionado traz tokens falsos.
// 2. Docker com Postgres/Redis no ar. A suíte semeia as igrejas sozinha quando a
//    tabela está vazia (as outras suítes e2e truncam o schema `public`).

const redisConnection = createRedisCacheConnection()

/** Icaraí, Niterói — where the seeded churches are. */
const CEP_NITEROI = '24210-201'
const origin = { lat: -22.9113709, lon: -43.1054179 }
const destinations = [
  { lat: -22.905555, lon: -43.108653 },
  { lat: -22.901485, lon: -43.12753 },
]

const LIVE_TIMEOUT_MS = 30_000

function liveProviders(): Record<'stadia' | 'geoapify' | 'ors', IRawChurchRoutingProvider> {
  return {
    stadia: new StadiaChurchRoutingProvider({
      matrixApiUrl: env.STADIA_MAPS_MATRIX_API_URL,
      apiToken: env.STADIA_API_TOKEN,
      defaultCosting: RoutingProfile.PEDESTRIAN,
    }),
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
  const config = { url: env.STADIA_MAPS_MATRIX_API_URL, headers: new AxiosHeaders() }

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
  nearestChurchesInfo: Array<{ distanceKm: number }>
}

function expectRankedWithin(body: NearestBody, maxKm: number) {
  const distances = body.nearestChurchesInfo.map((church) => church.distanceKm)

  expect(distances.length).toBeGreaterThan(0)
  expect(distances.every((km) => km > 0 && km <= maxKm)).toBe(true)
  expect(distances).toEqual([...distances].sort((a, b) => a - b))
}

describe('Live routing providers and routing mode (e2e, real APIs)', () => {
  beforeAll(async () => {
    if ((await prisma.church.count()) === 0) {
      execFileSync('npx', ['prisma', 'db', 'seed'], { stdio: 'ignore', env: process.env })
    }

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
        // request config, Authorization header included.
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

    // Stadia's current plan answers 403 on the matrix endpoint and ORS is down
    // on its own side. Either may come back at any time, so neither is required
    // to answer — but when one fails it must fail RETRYABLE, or the chain would
    // stop there instead of moving on to the next provider.
    it.each([['stadia' as const], ['ors' as const]])(
      '%s either answers with plausible distances or fails RETRYABLE',
      async (name) => {
        const raw = liveProviders()[name]

        for (const profile of [RoutingProfile.PEDESTRIAN, RoutingProfile.TRANSPORT]) {
          const result = await routeWith(raw, profile)

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
      'walks by default and keeps every church within the 10 km walking cap',
      async () => {
        const response = await request(app.server).get('/churches/nearest').query({ cep: CEP_NITEROI })

        expect(response.statusCode).toBe(200)
        expect(response.body.mode).toBe(RoutingProfile.PEDESTRIAN)
        expectRankedWithin(response.body as NearestBody, 10)
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'routes by vehicle when asked, within the 150 km transport cap',
      async () => {
        const response = await request(app.server)
          .get('/churches/nearest')
          .query({ cep: CEP_NITEROI, mode: RoutingProfile.TRANSPORT })

        expect(response.statusCode).toBe(200)
        expect(response.body.mode).toBe(RoutingProfile.TRANSPORT)
        expectRankedWithin(response.body as NearestBody, 150)
      },
      LIVE_TIMEOUT_MS,
    )

    it(
      'falls through to the live Geoapify when Stadia fails, without reaching ORS',
      async () => {
        vi.spyOn(StadiaChurchRoutingProvider.prototype, 'fetchRawDistances').mockRejectedValue(upstreamFailure(503))
        const geoapify = vi.spyOn(GeoapifyChurchRoutingProvider.prototype, 'fetchRawDistances')
        const ors = vi.spyOn(OpenRouteServiceChurchRoutingProvider.prototype, 'fetchRawDistances')

        const response = await request(app.server)
          .get('/churches/nearest')
          .query({ cep: CEP_NITEROI, mode: RoutingProfile.TRANSPORT })

        expect(response.statusCode).toBe(200)
        expect(response.body.mode).toBe(RoutingProfile.TRANSPORT)
        expectRankedWithin(response.body as NearestBody, 150)
        expect(geoapify).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          RoutingProfile.TRANSPORT,
          expect.anything(),
        )
        expect(ors).not.toHaveBeenCalled()
      },
      LIVE_TIMEOUT_MS,
    )

    it('rejects an unknown mode before calling any provider', async () => {
      const geoapify = vi.spyOn(GeoapifyChurchRoutingProvider.prototype, 'fetchRawDistances')

      const response = await request(app.server).get('/churches/nearest').query({ cep: CEP_NITEROI, mode: 'bicycle' })

      expect(response.statusCode).toBe(400)
      expect(geoapify).not.toHaveBeenCalled()
    })
  })
})
