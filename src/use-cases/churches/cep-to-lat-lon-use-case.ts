import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { GeoServiceBusyError } from '@use-cases/errors/geo-service-busy-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { ServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { AddressServiceBusyError } from '@use-cases/errors/address-service-busy-error'
import { TimeoutExceededOnFetchError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { AddressProviderFailureError } from 'providers/address-provider/error/address-provider-failure-error'
import { GeoProviderFailureError } from '@use-cases/errors/geo-provider-failure-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  EnumGeoPrecision,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { CachedFailureError, ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'

interface CepToLatLonRequest {
  cep: string
}

interface CepToLatLonResponse {
  userLat: number
  userLon: number
  precision: string
  coordinatesProviderName?: string
}

export class CepToLatLonUseCase {
  private readonly cacheManager: ResilientCache
  private readonly redis: Redis
  private readonly cacheSuccessResults: boolean

  constructor(
    private geocodingProvider: IGeocodingProvider,
    private addressProvider: IAddressProvider,
    redis: Redis,
    optionsOverride: ResilientCacheOptions,
    cacheSuccessResults = true,
  ) {
    this.redis = redis
    this.cacheSuccessResults = cacheSuccessResults
    this.cacheManager = new ResilientCache(redis, {
      prefix: optionsOverride.prefix,
      defaultTtlSeconds: optionsOverride.defaultTtlSeconds,
      negativeTtlSeconds: optionsOverride.negativeTtlSeconds,
      maxPendingFetches: optionsOverride.maxPendingFetches,
      fetchTimeoutMs: optionsOverride.fetchTimeoutMs,
      ttlJitterPercentage: optionsOverride.ttlJitterPercentage,
    })
  }

  async execute({ cep }: CepToLatLonRequest): Promise<CepToLatLonResponse> {
    const cleanCep = cep.replace(/\D/g, '')
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep })

    try {
      const result = await this.cacheManager.getOrFetch<CepToLatLonResponse>(
        cacheKey,
        async (signal) => {
          // This will throw InvalidCepError or CoordinatesNotFoundError
          // which will be caught by errorMapper and cached
          return await this.processCep(cleanCep, signal)
        },
        // errorMapper: Define which errors should be cached (business errors)
        (error) => {
          // Business errors - these should be cached with negativeTtl
          if (error instanceof InvalidCepError) {
            return {
              type: 'InvalidCepError',
              message: error.message,
              data: { cep: cleanCep },
            }
          }

          if (error instanceof CoordinatesNotFoundError) {
            return {
              type: 'CoordinatesNotFoundError',
              message: error.message,
              data: { cep: cleanCep },
            }
          }

          // System errors (timeouts, rate limits, 500s) - NOT cached
          // Returning null means "don't cache this error"
          return null
        },
      )

      if (!result) {
        throw new CepToLatLonError()
      }

      if (!this.cacheSuccessResults) {
        await this.redis.del(cacheKey)
      }

      return result
    } catch (error) {
      // Handle CachedFailureError - convert back to domain errors
      if (error instanceof CachedFailureError) {
        if (error.errorType === 'InvalidCepError') {
          throw new InvalidCepError()
        }
        if (error.errorType === 'CoordinatesNotFoundError') {
          throw new CoordinatesNotFoundError()
        }
        // This shouldn't happen, but fallback to generic error
        logger.error({ cep: cleanCep, cachedError: error }, 'Tipo de erro em cache inesperado no CepToLatLonUseCase')
        throw new CepToLatLonError()
      }

      // Domain errors thrown directly from processCep (first fetch)
      if (error instanceof InvalidCepError) {
        throw error
      }

      if (error instanceof CoordinatesNotFoundError) {
        throw error
      }

      if (error instanceof GeoServiceBusyError) {
        throw error
      }

      if (error instanceof AddressServiceBusyError) {
        throw error
      }

      if (error instanceof AddressProviderFailureError) {
        throw error
      }

      if (error instanceof GeoProviderFailureError) {
        throw error
      }

      if (error instanceof TimeoutExceededOnFetchError) {
        throw error
      }

      if (error instanceof ServiceOverloadError) {
        throw error
      }

      // Throw user-friendly error message ("Instabilidade temporária...")
      throw new CepToLatLonError()
    }
  }

  private async processCep(cleanCep: string, signal: AbortSignal): Promise<CepToLatLonResponse> {
    // 1. Fetch Address (ViaCEP / AwesomeAPI)
    // Passing signal to ensure we respect the global/cache timeout

    let address: IAddressData

    try {
      const data = await this.addressProvider.fetchAddress(cleanCep, signal)

      if (!data) {
        throw new InvalidCepError()
      }

      // 2. OPTIMIZATION: If Address Provider (AwesomeAPI) gave us coordinates, USE THEM.
      if (data.lat && data.lon) {
        return {
          userLat: data.lat,
          userLon: data.lon,
          precision: data.precision || EnumGeoPrecision.NO_CERTAINTY,
          coordinatesProviderName: data.providerName,
        }
      }

      address = data
    } catch (error) {
      if (error instanceof InvalidCepError) {
        throw error
      }
      throw error
    }

    const { logradouro, localidade, uf, bairro } = address

    // 3. Geocoding Fallback Strategies

    // Strategy A: Exact Match (Street)
    if (logradouro) {
      const exact = await this.geocodingProvider.search(`${logradouro}, ${localidade} - ${uf}, Brazil`, signal)
      if (exact) return this.mapResponse(exact)
    }

    // Strategy B: Approximate Match (Neighborhood)
    if (bairro) {
      const approx = await this.geocodingProvider.search(`${bairro}, ${localidade} - ${uf}, Brazil`, signal)
      if (approx) return this.mapResponse(approx)
    }

    // Strategy C: City Fallback
    if (localidade) {
      try {
        const city = await this.geocodingProvider.searchStructured(
          {
            city: localidade,
            state: uf,
            country: 'Brazil',
          },
          signal,
        )

        if (city === null) {
          throw new CoordinatesNotFoundError()
        }

        return this.mapResponse(city)
      } catch (error) {
        if (error instanceof CoordinatesNotFoundError) {
          throw error
        }

        logger.error(
          { cep: cleanCep, city: localidade, error },
          'Crítico: Falha ao buscar coordenadas da cidade no geocoding provider',
        )
        throw error
      }
    }

    // 4. PARANOID GUARD
    // We found the address data (text) but Geocoders failed to find even the city.
    // This implies a provider failure or data inconsistency.
    logger.error({ cep: cleanCep, city: localidade }, 'Crítico: Geocoding Provider não encontrou a cidade.')

    // This is a system error - won't be cached
    throw new CepToLatLonError()
  }

  private mapResponse(coords: IGeoCoordinates): CepToLatLonResponse {
    return {
      userLat: coords.lat,
      userLon: coords.lon,
      precision: coords.precision,
      coordinatesProviderName: coords.providerName,
    }
  }
}
