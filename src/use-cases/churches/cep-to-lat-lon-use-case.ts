import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { Redis } from 'ioredis'
import { logger } from '@lib/logger'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  EnumGeoPrecision,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { Result, ok, err, isOk, isErr } from 'core/shared/result'
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
  private readonly cacheManager: ResilientCache<AppError>
  private readonly redis: Redis
  private readonly cacheSuccessResults: boolean

  constructor(
    private geocodingProvider: IGeocodingProvider,
    private addressProvider: IAddressProvider,
    redis: Redis,
    optionsOverride: ResilientCacheOptions<AppError>,
    cacheSuccessResults = true,
  ) {
    this.redis = redis
    this.cacheSuccessResults = cacheSuccessResults
    this.cacheManager = new ResilientCache<AppError>(redis, optionsOverride)
  }

  async execute({ cep }: CepToLatLonRequest): Promise<Result<CepToLatLonResponse, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep })

    const result = await this.cacheManager.getOrFetch<CepToLatLonResponse>(cacheKey, async (signal: AbortSignal) => {
      return await this.processCep(cleanCep, signal)
    })

    if (isOk(result) && !this.cacheSuccessResults) {
      await this.redis.del(cacheKey)
    }

    return result
  }

  private async processCep(cleanCep: string, signal: AbortSignal): Promise<Result<CepToLatLonResponse, AppError>> {
    // 1. Fetch Address (ViaCEP / AwesomeAPI)
    // Passing signal to ensure we respect the global/cache timeout

    const addrResult = await this.addressProvider.fetchAddress(cleanCep, signal)

    if (isErr(addrResult)) {
      return err(addrResult.error)
    }

    const data = addrResult.value

    if (!data) {
      return err(new InvalidCepError())
    }

    // 2. OPTIMIZATION: If Address Provider (AwesomeAPI) gave us coordinates, USE THEM.
    if (data.lat && data.lon) {
      return ok({
        userLat: data.lat,
        userLon: data.lon,
        precision: data.precision ?? EnumGeoPrecision.NO_CERTAINTY,
        coordinatesProviderName: data.providerName ?? 'Unknown',
      })
    }

    const address = data
    const { logradouro, localidade, uf, bairro } = address

    // 3. Geocoding Fallback Strategies

    // Strategy A: Exact Match (Street)
    if (logradouro) {
      const exactResult = await this.geocodingProvider.search(`${logradouro}, ${localidade} - ${uf}, Brazil`, signal)
      if (isOk(exactResult) && exactResult.value) {
        return ok(this.mapResponse(exactResult.value))
      }
      if (isErr(exactResult) && exactResult.error.failureMode !== FailureMode.NOT_FOUND) {
        return err(exactResult.error)
      }
    }

    // Strategy B: Approximate Match (Neighborhood)
    if (bairro) {
      const approxResult = await this.geocodingProvider.search(`${bairro}, ${localidade} - ${uf}, Brazil`, signal)
      if (isOk(approxResult) && approxResult.value) {
        return ok(this.mapResponse(approxResult.value))
      }
      if (isErr(approxResult) && approxResult.error.failureMode !== FailureMode.NOT_FOUND) {
        return err(approxResult.error)
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
          return err(new CoordinatesNotFoundError())
        }
        return ok(this.mapResponse(cityResult.value))
      } else {
        return err(cityResult.error)
      }
    }

    // 4. PARANOID GUARD
    logger.error({ cep: cleanCep, city: localidade }, 'Crítico: Geocoding Provider não encontrou a cidade.')

    // This is a system error
    return err(new CepToLatLonError(cleanCep))
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
