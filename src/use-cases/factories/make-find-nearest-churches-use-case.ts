import { env } from '@env/index'
import { CacheCircuitBreakerOptions } from '@lib/infra/cache/resilient-cache'
import { getRedisCache, getRedisRateLimit } from '@lib/redis/clients/clients'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { FindNearestChurchesUseCase } from '@use-cases/churches/find-nearest-churches-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { PrismaChurchesRepository } from '@repositories/prisma/prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@repositories/prisma/errors/churches-error-mapping'
import { ResilientAddressProvider } from 'providers/address-provider/resilient-address-provider'
import { AwesomeApiProvider } from 'providers/address-provider/awesome-api-provider'
import { BrasilApiProvider } from 'providers/address-provider/brasil-api-provider'
import { ViaCepProvider } from 'providers/address-provider/viaCep-provider'
import { NominatimGeoProvider } from 'providers/geo-provider/nominatim-provider'
import { LocationIqProvider } from 'providers/geo-provider/location-iq-provider'
import { ResilientGeoProvider } from 'providers/geo-provider/resilient-geo-provider'
import { StadiaChurchRoutingProvider } from 'providers/church-routing-provider/stadia-church-routing-provider'
import { OpenRouteServiceChurchRoutingProvider } from 'providers/church-routing-provider/openrouteservice-church-routing-provider'
import { ResilientChurchRoutingProvider } from 'providers/church-routing-provider/resilient-church-routing-provider'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ResilientAddressProviderDecorator } from 'providers/address-provider/decorators/resilient-address-provider.decorator'
import { ResilientGeocodingProviderDecorator } from 'providers/geo-provider/decorators/resilient-geocoding-provider.decorator'
import { ResilientChurchRoutingProviderDecorator } from 'providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { Redis } from 'ioredis'
import { IChurchRoutingProvider } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { makeNearestChurchesCacheOptions } from '@use-cases/churches/church-lookup-cache-policy'
import { STADIA_CONFIG } from 'messages/constants/providers/stadia'
import { OPENROUTESERVICE_CONFIG } from 'messages/constants/providers/openrouteservice'

let cachedUseCase: FindNearestChurchesUseCase | null = null

function makeResilientGeoProvider(redisRateLimitConnection: Redis): ResilientGeoProvider {
  const rawNominatimProvider = new NominatimGeoProvider({
    apiUrl: env.NOMINATIM_API_URL,
  })

  const rawLocationIqProvider = new LocationIqProvider({
    apiUrl: env.LOCATION_IQ_API_URL,
    apiToken: env.LOCATION_IQ_API_TOKEN,
  })

  // Wrap with Resilient Decorators
  const nominatimProvider = new ResilientGeocodingProviderDecorator(rawNominatimProvider, redisRateLimitConnection)
  const locationIqProvider = new ResilientGeocodingProviderDecorator(rawLocationIqProvider, redisRateLimitConnection)

  return new ResilientGeoProvider([locationIqProvider, nominatimProvider])
}

function makeResilientAddressProvider(redisRateLimitConnection: Redis): ResilientAddressProvider {
  const rawAwesomeApiProvider = new AwesomeApiProvider({
    apiUrl: env.AWESOME_API_URL,
    apiToken: env.AWESOME_API_TOKEN,
  })

  const rawBrasilApiProvider = new BrasilApiProvider({
    apiUrl: env.BRASIL_API_URL,
  })

  const rawViaCepProvider = new ViaCepProvider({
    apiUrl: env.VIACEP_API_URL,
  })

  // Wrap with Resilient Decorators
  const awesomeApiProvider = new ResilientAddressProviderDecorator(rawAwesomeApiProvider, redisRateLimitConnection)
  const brasilApiProvider = new ResilientAddressProviderDecorator(rawBrasilApiProvider, redisRateLimitConnection)
  const viaCepProvider = new ResilientAddressProviderDecorator(rawViaCepProvider, redisRateLimitConnection)

  return new ResilientAddressProvider([awesomeApiProvider, brasilApiProvider, viaCepProvider])
}

/**
 * Stadia first, OpenRouteService when Stadia fails with a RETRYABLE error — an
 * outage, a quota, or a plan without matrix access (403), which is what made
 * every nearest-church lookup answer 503 while routing had a single provider.
 *
 * Each raw provider is wrapped in its resilient decorator (rate limiting + error
 * mapping only); caching happens once, at the FindNearestChurchesUseCase layer.
 */
export function makeChurchRoutingProvider(redisRateLimitConnection: Redis): IChurchRoutingProvider {
  const rawStadiaProvider = new StadiaChurchRoutingProvider({
    matrixApiUrl: env.STADIA_MAPS_MATRIX_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: RoutingProfile.PEDESTRIAN,
    timeoutMs: STADIA_CONFIG.DEFAULT_TIMEOUT_MS,
  })

  const rawOpenRouteServiceProvider = new OpenRouteServiceChurchRoutingProvider({
    matrixApiUrl: env.OPENROUTESERVICE_MATRIX_API_URL,
    apiToken: env.OPENROUTESERVICE_API_TOKEN,
    defaultCosting: RoutingProfile.PEDESTRIAN,
    timeoutMs: OPENROUTESERVICE_CONFIG.DEFAULT_TIMEOUT_MS,
  })

  return new ResilientChurchRoutingProvider([
    new ResilientChurchRoutingProviderDecorator(rawStadiaProvider, redisRateLimitConnection),
    new ResilientChurchRoutingProviderDecorator(rawOpenRouteServiceProvider, redisRateLimitConnection),
  ])
}

/**
 * Breaker settings for the cache's shared fetch, or `undefined` when breaking is
 * off — which composes the cache without a breaker rather than with a disabled
 * one, so the flag costs nothing per call.
 */
function cacheCircuitBreakerSettings(): CacheCircuitBreakerOptions | undefined {
  if (!env.CIRCUIT_BREAKER_ENABLED) {
    return undefined
  }

  return {
    failureThreshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
    samplingWindowMs: env.CIRCUIT_BREAKER_SAMPLING_WINDOW_MS,
    minimumThroughput: env.CIRCUIT_BREAKER_MIN_THROUGHPUT,
    halfOpenAfterMs: env.CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
  }
}

export function makeFindNearestChurchesUseCase(
  redisCacheConnection = getRedisCache(),
  redisRateLimitConnection = getRedisRateLimit(),
): FindNearestChurchesUseCase {
  if (cachedUseCase) {
    return cachedUseCase
  }

  // No cache here: FindNearestChurchesUseCase below is the single cache layer
  // for this flow, so intermediate coordinates are never stored.
  const cepToLatLonUseCase = new CepToLatLonUseCase(
    makeResilientGeoProvider(redisRateLimitConnection),
    makeResilientAddressProvider(redisRateLimitConnection),
  )

  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  const findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)

  cachedUseCase = new FindNearestChurchesUseCase(
    cepToLatLonUseCase,
    findNearbyChurchesKnnUseCase,
    new CalculateChurchRouteDistancesUseCase(makeChurchRoutingProvider(redisRateLimitConnection)),
    {
      redis: redisCacheConnection,
      options: makeNearestChurchesCacheOptions(cacheCircuitBreakerSettings()),
      defaultProfile: RoutingProfile.PEDESTRIAN,
    },
  )

  return cachedUseCase
}
