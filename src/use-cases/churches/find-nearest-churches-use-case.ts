import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { CachedFailureError, ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { Redis } from 'ioredis'

export interface FindNearestChurchesRequest {
  cep: string
}

export interface FindNearestChurchesResponse {
  nearestChurchesInfo: ReturnType<typeof ChurchPresenter.toHTTP>
  totalFound: number
  precision: string
  providerName?: string
}

export class FindNearestChurchesUseCase {
  private readonly cacheManager: ResilientCache

  constructor(
    private readonly cepToLatLonUseCase: CepToLatLonUseCase,
    private readonly findNearbyChurchesKnnUseCase: FindNearbyChurchesKnnUseCase,
    private readonly calculateChurchRouteDistancesUseCase: CalculateChurchRouteDistancesUseCase,
    redis: Redis,
    optionsOverride: ResilientCacheOptions,
  ) {
    this.cacheManager = new ResilientCache(redis, {
      prefix: optionsOverride.prefix,
      defaultTtlSeconds: optionsOverride.defaultTtlSeconds,
      negativeTtlSeconds: optionsOverride.negativeTtlSeconds,
      maxPendingFetches: optionsOverride.maxPendingFetches,
      fetchTimeoutMs: optionsOverride.fetchTimeoutMs,
      ttlJitterPercentage: optionsOverride.ttlJitterPercentage,
    })
  }

  async execute({ cep }: FindNearestChurchesRequest): Promise<FindNearestChurchesResponse> {
    const cleanCep = cep.replace(/\D/g, '')
    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep })

    try {
      const result = await this.cacheManager.getOrFetch<FindNearestChurchesResponse>(
        cacheKey,
        async () => {
          const { userLat, userLon, precision, providerName } = await this.cepToLatLonUseCase.execute({
            cep: cleanCep,
          })

          const { churches, totalFound } = await this.findNearbyChurchesKnnUseCase.execute({
            userLat,
            userLon,
          })

          const nearestChurches = await this.calculateChurchRouteDistancesUseCase.findNearest({
            churches,
            user: { userLat, userLon },
          })

          return {
            nearestChurchesInfo: ChurchPresenter.toHTTP(nearestChurches),
            totalFound,
            precision,
            providerName,
          }
        },
      )

      if (!result) {
        throw new Error('Falha ao calcular igrejas próximas!')
      }

      return result
    } catch (error) {
      if (error instanceof CachedFailureError) {
        if (error.errorType === 'InvalidCepError') {
          throw new InvalidCepError()
        }

        if (error.errorType === 'CoordinatesNotFoundError') {
          throw new CoordinatesNotFoundError()
        }
      }

      if (error instanceof InvalidCepError) {
        throw error
      }

      if (error instanceof CoordinatesNotFoundError) {
        throw error
      }

      throw error
    }
  }
}
