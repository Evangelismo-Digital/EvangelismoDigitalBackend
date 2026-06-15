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
import { IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { CachedFailureError, ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { Result, ok, errOf, isOk, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

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
          return await this.processCep(cleanCep, signal)
        },
        // errorMapper: cache errors that represent a permanent domain fact (NOT_FOUND).
        // RETRYABLE infra errors are never cached — returning null skips caching.
        (error) => {
          if (error instanceof AppError && error.failureMode === FailureMode.NOT_FOUND) {
            return {
              type: error.constructor.name,
              message: error.message,
              data: { cep: cleanCep },
            }
          }
          return null
        },
      )

      if (!result) {
        return errOf(new CepToLatLonError(cleanCep))
      }

      if (!this.cacheSuccessResults) {
        await this.redis.del(cacheKey)
      }

      return ok(result)
    } catch (error) {
      // CachedFailureError: reconstruct the original AppError from errorType
      if (error instanceof CachedFailureError) {
        if (error.errorType === 'InvalidCepError') {
          return errOf(new InvalidCepError())
        }
        if (error.errorType === 'CoordinatesNotFoundError') {
          return errOf(new CoordinatesNotFoundError())
        }
        logger.error({ cep: cleanCep, cachedError: error }, 'Tipo de erro em cache inesperado no CepToLatLonUseCase')
        return errOf(new CepToLatLonError(cleanCep))
      }

      // AppErrors propagate directly (domain and infra alike)
      if (error instanceof AppError) {
        return errOf(error)
      }

      // Cache infrastructure errors — translate to canonical AppErrors
      if (error instanceof CacheServiceOverloadError) {
        return errOf(new InfraServiceOverloadError())
      }

      if (error instanceof CacheTimeoutError) {
        return errOf(new TimeoutExceededError())
      }

      return errOf(new CepToLatLonError(cleanCep))
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
      }
      if (isErr(exactResult) && exactResult.error.failureMode !== FailureMode.NOT_FOUND) {
        throw exactResult.error
      }
    }

    // Strategy B: Approximate Match (Neighborhood)
    if (bairro) {
      const approxResult = await this.geocodingProvider.search(`${bairro}, ${localidade} - ${uf}, Brazil`, signal)
      if (isOk(approxResult) && approxResult.value) {
        return this.mapResponse(approxResult.value)
      }
      if (isErr(approxResult) && approxResult.error.failureMode !== FailureMode.NOT_FOUND) {
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
    throw new CepToLatLonError(cleanCep)
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
