import { ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { Redis } from 'ioredis'
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

    return await this.cacheManager.getOrFetch<FindNearestChurchesResponse>(cacheKey, async (signal: AbortSignal) => {
      const cepResult = await this.cepToLatLonUseCase.execute({
        cep: cleanCep,
      })

      if (isErr(cepResult)) {
        return err(cepResult.error)
      }

      const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value

      const knnResult = await this.findNearbyChurchesKnnUseCase.execute({
        userLat,
        userLon,
      })

      if (isErr(knnResult)) {
        return err(knnResult.error)
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
        return err(nearestChurchesResult.error)
      }

      const nearestChurches = nearestChurchesResult.value

      return ok({
        nearestChurchesInfo: ChurchPresenter.toHTTP(nearestChurches),
        totalFound,
        precision,
        coordinatesProviderName,
      })
    })
  }
}
