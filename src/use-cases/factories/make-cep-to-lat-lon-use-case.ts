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

let cachedUseCase: CepToLatLonUseCase | null = null

export function makeCepToLatLonUseCase(
  redisCacheConnection = getRedisCache(),
  redisRateLimitConnection = getRedisRateLimit(),
  cacheSuccessResults = true,
): CepToLatLonUseCase {
  if (cachedUseCase) {
    return cachedUseCase
  }

  // Setup Geocoding Providers
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

  // Setup Resilient Geo Strategy
  const resilientGeoProvider = new ResilientGeoProvider([locationIqProvider, nominatimProvider])

  // Setup Address Providers
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
    },
    cacheSuccessResults,
  )

  // 3. Return the new singleton
  return cachedUseCase
}
