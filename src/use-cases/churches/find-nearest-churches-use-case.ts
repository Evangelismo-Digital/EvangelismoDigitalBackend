import { CachedFailureError, ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { Redis } from 'ioredis'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { ServiceOverloadError as CacheServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { TimeoutExceededOnFetchError as CacheTimeoutError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ErrorCategory } from 'core/types/error-category/error-category.enum'

export interface FindNearestChurchesRequest {
  cep: string
}

export interface FindNearestChurchesResponse {
  nearestChurchesInfo: ReturnType<typeof ChurchPresenter.toHTTP>
  totalFound: number
  precision: string
  coordinatesProviderName?: string
}

export class FindNearestChurchesUseCase {
  private readonly cacheManager: ResilientCache
  private readonly defaultProfile: RoutingProfile

  constructor(
    private readonly cepToLatLonUseCase: CepToLatLonUseCase,
    private readonly findNearbyChurchesKnnUseCase: FindNearbyChurchesKnnUseCase,
    private readonly calculateChurchRouteDistancesUseCase: CalculateChurchRouteDistancesUseCase,
    redis: Redis,
    optionsOverride: ResilientCacheOptions,
    defaultProfile: RoutingProfile = RoutingProfile.PEDESTRIAN,
  ) {
    this.cacheManager = new ResilientCache(redis, {
      prefix: optionsOverride.prefix,
      defaultTtlSeconds: optionsOverride.defaultTtlSeconds,
      negativeTtlSeconds: optionsOverride.negativeTtlSeconds,
      maxPendingFetches: optionsOverride.maxPendingFetches,
      fetchTimeoutMs: optionsOverride.fetchTimeoutMs,
      ttlJitterPercentage: optionsOverride.ttlJitterPercentage,
    })
    this.defaultProfile = defaultProfile
  }

  async execute({ cep }: FindNearestChurchesRequest): Promise<Result<FindNearestChurchesResponse, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep, profile: this.defaultProfile })

    try {
      const result = await this.cacheManager.getOrFetch<FindNearestChurchesResponse>(
        cacheKey,
        async (signal) => {
          const cepResult = await this.cepToLatLonUseCase.execute({
            cep: cleanCep,
          })

          if (isErr(cepResult)) {
            throw cepResult.error
          }

          const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value

          const knnResult = await this.findNearbyChurchesKnnUseCase.execute({
            userLat,
            userLon,
          })
          if (isErr(knnResult)) {
            throw knnResult.error
          }
          const { churches, totalFound } = knnResult.value

          const nearestChurchesResult = await this.calculateChurchRouteDistancesUseCase.findNearest(
            {
              churches,
              user: { userLat, userLon },
              signal,
            },
            this.defaultProfile,
          )

          if (isErr(nearestChurchesResult)) {
            throw nearestChurchesResult.error
          }

          const nearestChurches = nearestChurchesResult.value

          return {
            nearestChurchesInfo: ChurchPresenter.toHTTP(nearestChurches),
            totalFound,
            precision,
            coordinatesProviderName,
          }
        },
        // errorMapper: cache only NOT_FOUND domain facts; never cache RETRYABLE infra errors
        (error: unknown) => {
          if (error instanceof AppError && error.category === ErrorCategory.NOT_FOUND) {
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
        return errOf(new NoNearbyChurchesFoundError())
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
        // Fallback for corrupted cache entries
        return errOf(new NoNearbyChurchesFoundError())
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

      return errOf(new NoNearbyChurchesFoundError())
    }
  }
}
