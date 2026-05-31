import { env } from '@env/index'
import { getRedisCache, getRedisRateLimit } from '@lib/redis/clients/clients'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { FindNearestChurchesUseCase } from '@use-cases/churches/find-nearest-churches-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { PrismaChurchesRepository } from '@repositories/prisma/prisma-churches-repository'
import { ResilientAddressProvider } from 'providers/address-provider/resilient-address-provider'
import { AwesomeApiProvider } from 'providers/address-provider/awesome-api-provider'
import { BrasilApiProvider } from 'providers/address-provider/brasil-api-provider'
import { ViaCepProvider } from 'providers/address-provider/viaCep-provider'
import { NominatimGeoProvider } from 'providers/geo-provider/nominatim-provider'
import { LocationIqProvider } from 'providers/geo-provider/location-iq-provider'
import { ResilientGeoProvider } from 'providers/geo-provider/resilient-geo-provider'
import { StadiaChurchRoutingProvider } from 'providers/church-routing-provider/stadia-church-routing-provider'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

let cachedUseCase: FindNearestChurchesUseCase | null = null

export function makeFindNearestChurchesUseCase(
  redisCacheConnection = getRedisCache(),
  redisRateLimitConnection = getRedisRateLimit(),
): FindNearestChurchesUseCase {
  if (cachedUseCase) {
    return cachedUseCase
  }

  const nominatimProvider = new NominatimGeoProvider(
    {
      apiUrl: env.NOMINATIM_API_URL,
    },
    redisRateLimitConnection,
  )

  const locationIqProvider = new LocationIqProvider(
    {
      apiUrl: env.LOCATION_IQ_API_URL,
      apiToken: env.LOCATION_IQ_API_TOKEN,
    },
    redisRateLimitConnection,
  )

  const resilientGeoProvider = new ResilientGeoProvider([locationIqProvider, nominatimProvider])

  const awesomeApiProvider = new AwesomeApiProvider(
    {
      apiUrl: env.AWESOME_API_URL,
      apiToken: env.AWESOME_API_TOKEN,
    },
    redisRateLimitConnection,
  )

  const brasilApiProvider = new BrasilApiProvider(
    {
      apiUrl: env.BRASIL_API_URL,
    },
    redisRateLimitConnection,
  )

  const viaCepProvider = new ViaCepProvider(
    {
      apiUrl: env.VIACEP_API_URL,
    },
    redisRateLimitConnection,
  )

  const resilientAddressProvider = new ResilientAddressProvider([awesomeApiProvider, brasilApiProvider, viaCepProvider])

  const cepToLatLonUseCase = new CepToLatLonUseCase(
    resilientGeoProvider,
    resilientAddressProvider,
    redisCacheConnection,
    {
      prefix: 'cache:cep-coords:',
      defaultTtlSeconds: 60 * 60 * 24 * 7,
      negativeTtlSeconds: 60 * 30,
      maxPendingFetches: 500,
      fetchTimeoutMs: 25000,
    },
    false,
  )

  const churchesRepository = new PrismaChurchesRepository()
  const findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)
  const calculateChurchRouteDistancesUseCase = new CalculateChurchRouteDistancesUseCase(
    new StadiaChurchRoutingProvider(
      {
        apiUrl: env.STADIA_MAPS_API_URL,
        apiToken: env.STADIA_API_TOKEN,
        defaultCosting: RoutingProfile.PEDESTRIAN,
        timeoutMs: 2_500,
      },
      redisRateLimitConnection,
      redisCacheConnection,
      {
        prefix: 'cache:stadia-route-distance:',
        defaultTtlSeconds: 60 * 60 * 24 * 7,
        negativeTtlSeconds: 0,
        maxPendingFetches: 500,
        fetchTimeoutMs: 2_500,
      },
    ),
  )

  cachedUseCase = new FindNearestChurchesUseCase(
    cepToLatLonUseCase,
    findNearbyChurchesKnnUseCase,
    calculateChurchRouteDistancesUseCase,
    redisCacheConnection,
    {
      prefix: 'cache:nearest-churches:',
      defaultTtlSeconds: 60 * 60 * 24 * 7,
      negativeTtlSeconds: 60 * 30,
      maxPendingFetches: 500,
      fetchTimeoutMs: 25000,
    },
    RoutingProfile.PEDESTRIAN,
  )

  return cachedUseCase
}
