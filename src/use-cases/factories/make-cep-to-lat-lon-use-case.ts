import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { ViaCepProvider } from 'providers/address-provider/viaCep-provider'
import { AwesomeApiProvider } from 'providers/address-provider/awesome-api-provider'
import { ResilientAddressProvider } from 'providers/address-provider/resilient-address-provider'
import { NominatimGeoProvider } from 'providers/geo-provider/nominatim-provider'
import { LocationIqProvider } from 'providers/geo-provider/location-iq-provider'
import { ResilientGeoProvider } from 'providers/geo-provider/resilient-geo-provider'
import { env } from '@env/index'
import { BrasilApiProvider } from 'providers/address-provider/brasil-api-provider'
import { getRedisCache, getRedisRateLimit } from '@lib/redis/clients/clients'
import { ResilientAddressProviderDecorator } from 'providers/address-provider/decorators/resilient-address-provider.decorator'
import { ResilientGeocodingProviderDecorator } from 'providers/geo-provider/decorators/resilient-geocoding-provider.decorator'
import { deserializeAppError } from 'errors/app-error-registry'
import { AppError } from 'errors/app-error'

let cachedUseCase: CepToLatLonUseCase | null = null

const serializeError = (err: AppError) => ({
  type: err.constructor.name,
  message: err.message,
  data: (err as any).data || err,
})

const deserializeError = (type: string, message: string, data?: any) => {
  return deserializeAppError(type, message, data) || (new Error(message) as any)
}

export function makeCepToLatLonUseCase(
  redisCacheConnection = getRedisCache(),
  redisRateLimitConnection = getRedisRateLimit(),
  cacheSuccessResults = true,
): CepToLatLonUseCase {
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

  // Create Use Case
  cachedUseCase = new CepToLatLonUseCase(
    resilientGeoProvider,
    resilientAddressProvider,
    redisCacheConnection,
    {
      prefix: 'cache:cep-coords:',
      defaultTtlSeconds: 60 * 60 * 24 * 7, // 7 days
      negativeTtlSeconds: 60 * 30, // 30 minutes (Negative Cache)
      maxPendingFetches: 500,
      fetchTimeoutMs: 25000,
      serializeError,
      deserializeError,
    },
    cacheSuccessResults,
  )

  return cachedUseCase
}
