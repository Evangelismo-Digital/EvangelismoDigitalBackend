import { ResilientCache, ResilientCacheOptions } from '@lib/infra/cache/resilient-cache'
import { PublicNearbyChurch, toPublicNearbyChurches } from 'core/projections/public-church'
import { CepToLatLonUseCase } from '@use-cases/churches/cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from '@use-cases/churches/calculate-church-route-distances-use-case'
import { Redis } from 'ioredis'
import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Deadline } from 'core/shared/deadline'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface FindNearestChurchesRequest {
  cep: string
  /**
   * The caller's budget. Supplied by the HTTP boundary; defaults to unbounded
   * for non-HTTP callers (workers, scripts) that have no clock to answer to.
   */
  deadline?: Deadline
}

export interface FindNearestChurchesResponse {
  nearestChurchesInfo: PublicNearbyChurch[]
  totalFound: number
  precision: string
  coordinatesProviderName?: string
}

/**
 * The single cache layer for the whole "find the nearest church" flow.
 *
 * A CEP hit returns the finished church list — the cache holds no intermediate
 * values (coordinates, KNN candidates), so every collaborator below runs only
 * on a miss and inherits this layer's budget as a {@link Deadline}.
 */
/**
 * How this use-case's cache is wired.
 *
 * The Redis client, the cache options and the routing profile were three
 * separate constructor parameters, which pushed the signature to six and made
 * every call site a row of positional arguments whose order only the compiler
 * could check. They are one concern — "which cache, configured how" — so they
 * travel together and are named at the call site.
 */
export interface NearestChurchesCacheWiring {
  redis: Redis
  options: ResilientCacheOptions<AppError>
  /** Defaults to PEDESTRIAN, the profile the public endpoint uses. */
  defaultProfile?: RoutingProfile
}

export class FindNearestChurchesUseCase {
  private readonly cacheManager: ResilientCache<AppError>
  private readonly defaultProfile: RoutingProfile

  constructor(
    private readonly cepToLatLonUseCase: CepToLatLonUseCase,
    private readonly findNearbyChurchesKnnUseCase: FindNearbyChurchesKnnUseCase,
    private readonly calculateChurchRouteDistancesUseCase: CalculateChurchRouteDistancesUseCase,
    cache: NearestChurchesCacheWiring,
  ) {
    this.cacheManager = new ResilientCache<AppError>(cache.redis, cache.options)
    this.defaultProfile = cache.defaultProfile ?? RoutingProfile.PEDESTRIAN
  }

  async execute({
    cep,
    deadline = Deadline.none(),
  }: FindNearestChurchesRequest): Promise<Result<FindNearestChurchesResponse, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

    const cacheKey = this.cacheManager.generateKey({ cep: cleanCep, profile: this.defaultProfile })

    return await this.cacheManager.getOrFetch<FindNearestChurchesResponse>(
      cacheKey,
      (fetchDeadline: Deadline) => this.computeNearestChurches(cleanCep, fetchDeadline),
      deadline,
    )
  }

  /**
   * Runs only on a cache miss. Every step receives the cache layer's budget, so
   * the whole chain shares one clock and each leg derives its own timeout from
   * whatever is left of it.
   */
  private async computeNearestChurches(
    cleanCep: string,
    deadline: Deadline,
  ): Promise<Result<FindNearestChurchesResponse, AppError>> {
    const cepResult = await this.cepToLatLonUseCase.execute({ cep: cleanCep, deadline })

    if (isErr(cepResult)) {
      return err(cepResult.error)
    }

    const { userLat, userLon, precision, coordinatesProviderName } = cepResult.value

    const knnResult = await this.findNearbyChurchesKnnUseCase.execute({ userLat, userLon, deadline })

    if (isErr(knnResult)) {
      return err(knnResult.error)
    }

    const { churches, totalFound } = knnResult.value

    const nearestChurchesResult = await this.rankByRouteDistance(churches, { userLat, userLon }, deadline)

    if (isErr(nearestChurchesResult)) {
      return err(nearestChurchesResult.error)
    }

    return ok({
      nearestChurchesInfo: toPublicNearbyChurches(nearestChurchesResult.value),
      totalFound,
      precision,
      coordinatesProviderName,
    })
  }

  private async rankByRouteDistance(
    churches: NearbyChurch[],
    user: { userLat: number; userLon: number },
    deadline: Deadline,
  ): Promise<Result<NearbyChurch[], AppError>> {
    return await this.calculateChurchRouteDistancesUseCase.findNearest(
      { churches, user, deadline },
      this.defaultProfile,
    )
  }
}
