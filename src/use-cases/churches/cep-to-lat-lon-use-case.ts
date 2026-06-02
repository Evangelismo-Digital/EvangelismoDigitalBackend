import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { ServiceOverloadError as CacheServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { TimeoutExceededOnFetchError as CacheTimeoutError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  EnumGeoPrecision,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { CachedFailureError, ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { Result, ok, errOf, isOk, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

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

  async execute({ cep }: CepToLatLonRequest): Promise<Result<CepToLatLonResponse, AppError>> {
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
        return errOf(new CepToLatLonError())
      }

      if (!this.cacheSuccessResults) {
        await this.redis.del(cacheKey)
      }

      return ok(result)
    } catch (error) {
      // Handle CachedFailureError - convert back to domain errors
      if (error instanceof CachedFailureError) {
        if (error.errorType === 'InvalidCepError') {
          return errOf(new InvalidCepError())
        }
        if (error.errorType === 'CoordinatesNotFoundError') {
          return errOf(new CoordinatesNotFoundError())
        }
        // This shouldn't happen, but fallback to generic error
        logger.error({ cep: cleanCep, cachedError: error }, 'Tipo de erro em cache inesperado no CepToLatLonUseCase')
        return errOf(new CepToLatLonError())
      }

      // Domain or System errors thrown directly
      if (error instanceof AppError) {
        return errOf(error)
      }

      if (error instanceof CacheServiceOverloadError) {
        return errOf(new InfraServiceOverloadError())
      }

      if (error instanceof CacheTimeoutError) {
        return errOf(new TimeoutExceededError())
      }

      // Throw user-friendly error message
      return errOf(new CepToLatLonError())
    }
  }

  private async processCep(cleanCep: string, signal: AbortSignal): Promise<CepToLatLonResponse> {
    // 1. Fetch Address (ViaCEP / AwesomeAPI)
    // Passing signal to ensure we respect the global/cache timeout

    const addrResult = await this.addressProvider.fetchAddress(cleanCep, signal)

    if (isErr(addrResult)) {
      throw addrResult.error
    }

    const data = addrResult.value

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

    const address = data
    const { logradouro, localidade, uf, bairro } = address

    // 3. Geocoding Fallback Strategies

    // Strategy A: Exact Match (Street)
    if (logradouro) {
      const exactResult = await this.geocodingProvider.search(`${logradouro}, ${localidade} - ${uf}, Brazil`, signal)
      if (isOk(exactResult) && exactResult.value) {
        return this.mapResponse(exactResult.value)
      } else if (isErr(exactResult) && !(exactResult.error instanceof CoordinatesNotFoundError)) {
        throw exactResult.error
      }
    }

    // Strategy B: Approximate Match (Neighborhood)
    if (bairro) {
      const approxResult = await this.geocodingProvider.search(`${bairro}, ${localidade} - ${uf}, Brazil`, signal)
      if (isOk(approxResult) && approxResult.value) {
        return this.mapResponse(approxResult.value)
      } else if (isErr(approxResult) && !(approxResult.error instanceof CoordinatesNotFoundError)) {
        throw approxResult.error
      }
    }

    // Strategy C: City Fallback
    if (localidade) {
      const cityResult = await this.geocodingProvider.searchStructured(
        {
          city: localidade,
          state: uf,
          country: 'Brazil',
        },
        signal,
      )

      if (isOk(cityResult)) {
        if (cityResult.value === null) {
          throw new CoordinatesNotFoundError()
        }
        return this.mapResponse(cityResult.value)
      } else {
        throw cityResult.error
      }
    }

    // 4. PARANOID GUARD
    logger.error({ cep: cleanCep, city: localidade }, 'Crítico: Geocoding Provider não encontrou a cidade.')

    // This is a system error
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
