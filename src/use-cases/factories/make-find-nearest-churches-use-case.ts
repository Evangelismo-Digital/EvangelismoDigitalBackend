import { env } from '@env/index'
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
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ResilientAddressProviderDecorator } from 'providers/address-provider/decorators/resilient-address-provider.decorator'
import { ResilientGeocodingProviderDecorator } from 'providers/geo-provider/decorators/resilient-geocoding-provider.decorator'
import { ResilientChurchRoutingProviderDecorator } from 'providers/church-routing-provider/decorators/resilient-church-routing-provider.decorator'
import { serializeAppError, deserializeAppError } from 'errors/app-error-registry'
import { CACHE_CONFIG } from 'messages/constants/cache/cache'
import { STADIA_CONFIG } from 'messages/constants/providers/stadia'

let cachedUseCase: FindNearestChurchesUseCase | null = null

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
      prefix: CACHE_CONFIG.CEP_COORDS.PREFIX,
      defaultTtlSeconds: CACHE_CONFIG.CEP_COORDS.DEFAULT_TTL_SECONDS,
      negativeTtlSeconds: CACHE_CONFIG.CEP_COORDS.NEGATIVE_TTL_SECONDS,
      maxPendingFetches: CACHE_CONFIG.CEP_COORDS.MAX_PENDING_FETCHES,
      fetchTimeoutMs: CACHE_CONFIG.CEP_COORDS.FETCH_TIMEOUT_MS,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError,
    },
    false,
  )

  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  const findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)

  // Setup Raw Routing Provider
  const rawRoutingProvider = new StadiaChurchRoutingProvider({
    apiUrl: env.STADIA_MAPS_API_URL,
    apiToken: env.STADIA_API_TOKEN,
    defaultCosting: RoutingProfile.PEDESTRIAN,
    timeoutMs: STADIA_CONFIG.DEFAULT_TIMEOUT_MS,
  })

  // Wrap with Resilient Decorator
  const routingProvider = new ResilientChurchRoutingProviderDecorator(
    rawRoutingProvider,
    redisRateLimitConnection,
    redisCacheConnection,
    {
      prefix: CACHE_CONFIG.STADIA_ROUTE.PREFIX,
      defaultTtlSeconds: CACHE_CONFIG.STADIA_ROUTE.DEFAULT_TTL_SECONDS,
      negativeTtlSeconds: CACHE_CONFIG.STADIA_ROUTE.NEGATIVE_TTL_SECONDS,
      maxPendingFetches: CACHE_CONFIG.STADIA_ROUTE.MAX_PENDING_FETCHES,
      fetchTimeoutMs: CACHE_CONFIG.STADIA_ROUTE.FETCH_TIMEOUT_MS,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError,
    },
  )

  const calculateChurchRouteDistancesUseCase = new CalculateChurchRouteDistancesUseCase(routingProvider)

  cachedUseCase = new FindNearestChurchesUseCase(
    cepToLatLonUseCase,
    findNearbyChurchesKnnUseCase,
    calculateChurchRouteDistancesUseCase,
    redisCacheConnection,
    {
      prefix: CACHE_CONFIG.NEAREST_CHURCHES.PREFIX,
      defaultTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.DEFAULT_TTL_SECONDS,
      negativeTtlSeconds: CACHE_CONFIG.NEAREST_CHURCHES.NEGATIVE_TTL_SECONDS,
      maxPendingFetches: CACHE_CONFIG.NEAREST_CHURCHES.MAX_PENDING_FETCHES,
      fetchTimeoutMs: CACHE_CONFIG.NEAREST_CHURCHES.FETCH_TIMEOUT_MS,
      serializeError: serializeAppError,
      deserializeError: deserializeAppError,
    },
    RoutingProfile.PEDESTRIAN,
  )

  return cachedUseCase
}
