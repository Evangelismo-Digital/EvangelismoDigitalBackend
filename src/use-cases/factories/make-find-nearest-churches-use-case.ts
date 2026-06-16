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
import { ResilientAddressProviderDecorator } from 'providers/address-provider/decorators/resilient-address-provider.decorator'
import { ResilientGeocodingProviderDecorator } from 'providers/geo-provider/decorators/resilient-geocoding-provider.decorator'
import { ResilientChurchRoutingProviderDecorator } from 'providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { deserializeAppError } from 'errors/app-error-registry'
import { AppError } from 'errors/app-error'

let cachedUseCase: FindNearestChurchesUseCase | null = null

const serializeError = (err: AppError) => ({
  type: err.constructor.name,
  message: err.message,
  data: (err as any).data || err,
})

const deserializeError = (type: string, message: string, data?: any) => {
  return deserializeAppError(type, message, data) || (new Error(message) as any)
}

export function makeFindNearestChurchesUseCase(
  redisCacheConnection = getRedisCache(),
  redisRateLimitConnection = getRedisRateLimit(),
): FindNearestChurchesUseCase {
  if (cachedUseCase) {
    return cachedUseCase
  }

  // Setup Raw Geocoding Providers
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

  // Setup Resilient Geo Strategy
  const resilientGeoProvider = new ResilientGeoProvider([locationIqProvider, nominatimProvider])

  // Setup Raw Address Providers
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
      serializeError,
      deserializeError,
    },
    false,
  )

  const churchesRepository = new PrismaChurchesRepository()
  const findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)

  // Setup Raw Routing Provider
  const rawRoutingProvider = new StadiaChurchRoutingProvider({
    apiUrl: env.STADIA_MAPS_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: RoutingProfile.PEDESTRIAN,
    timeoutMs: 2_500,
  })

  // Wrap with Resilient Decorator
  const routingProvider = new ResilientChurchRoutingProviderDecorator(
    rawRoutingProvider,
    redisRateLimitConnection,
    redisCacheConnection,
    {
      prefix: 'cache:stadia-route-distance:',
      defaultTtlSeconds: 60 * 60 * 24 * 7,
      negativeTtlSeconds: 0,
      maxPendingFetches: 500,
      fetchTimeoutMs: 2_500,
      serializeError,
      deserializeError,
    },
  )

  const calculateChurchRouteDistancesUseCase = new CalculateChurchRouteDistancesUseCase(routingProvider)

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
      serializeError,
      deserializeError,
    },
    RoutingProfile.PEDESTRIAN,
  )

  return cachedUseCase
}
