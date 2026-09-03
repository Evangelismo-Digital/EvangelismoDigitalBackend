import { ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { Redis } from 'ioredis'
import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface FindNearestChurchesRequest {
  cep: string
}

export interface FindNearestChurchesResponse {
  nearestChurchesInfo: ReturnType<typeof ChurchPresenter.toHTTP>
  totalFound: number
  precision: string
  coordinatesProviderName?: string
}

/**
 * The single cache layer for the whole "find the nearest church" flow.
 *
 * A CEP hit returns the finished church list — the cache holds no intermediate
 * values (coordinates, KNN candidates), so every collaborator below runs only
 * on a miss and inherits this layer's timeout budget through `signal`.
 */
export class FindNearestChurchesUseCase {
  private readonly cacheManager: ResilientCache<AppError>
  private readonly defaultProfile: RoutingProfile

  constructor(
    private readonly cepToLatLonUseCase: CepToLatLonUseCase,
    private readonly findNearbyChurchesKnnUseCase: FindNearbyChurchesKnnUseCase,
    private readonly calculateChurchRouteDistancesUseCase: CalculateChurchRouteDistancesUseCase,
    redis: Redis,
    optionsOverride: ResilientCacheOptions<AppError>,
    defaultProfile: RoutingProfile = RoutingProfile.PEDESTRIAN,
  ) {
    this.cacheManager = new ResilientCache<AppError>(redis, optionsOverride)
    this.defaultProfile = defaultProfile
  }

  async execute({ cep }: FindNearestChurchesRequest): Promise<Result<FindNearestChurchesResponse, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep, profile: this.defaultProfile })

    return await this.cacheManager.getOrFetch<FindNearestChurchesResponse>(cacheKey, (signal: AbortSignal) =>
      this.computeNearestChurches(cleanCep, signal),
    )
  }

  /**
   * Runs only on a cache miss. Every step receives the cache layer's `signal`
   * so the whole chain shares one timeout budget.
   */
  private async computeNearestChurches(
    cleanCep: string,
    signal: AbortSignal,
  ): Promise<Result<FindNearestChurchesResponse, AppError>> {
    const cepResult = await this.cepToLatLonUseCase.execute({ cep: cleanCep, signal })

    if (isErr(cepResult)) {
      return err(cepResult.error)
    }

    const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value

    const knnResult = await this.findNearbyChurchesKnnUseCase.execute({ userLat, userLon })

    if (isErr(knnResult)) {
      return err(knnResult.error)
    }

    const { churches, totalFound } = knnResult.value

    const nearestChurchesResult = await this.rankByRouteDistance(churches, { userLat, userLon }, signal)

    if (isErr(nearestChurchesResult)) {
      return err(nearestChurchesResult.error)
    }

    return ok({
      nearestChurchesInfo: ChurchPresenter.toHTTP(nearestChurchesResult.value),
      totalFound,
      precision,
      coordinatesProviderName,
    })
  }

  private async rankByRouteDistance(
    churches: NearbyChurch[],
    user: { userLat: number; userLon: number },
    signal: AbortSignal,
  ): Promise<Result<NearbyChurch[], AppError>> {
    return await this.calculateChurchRouteDistancesUseCase.findNearest({ churches, user, signal }, this.defaultProfile)
  }
}
