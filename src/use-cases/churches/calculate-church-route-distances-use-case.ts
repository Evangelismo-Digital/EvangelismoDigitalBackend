import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'

/* =======================
   Input Types
======================= */

export interface User {
  userLat: number
  userLon: number
}

export interface FindNearestProps {
  churches: NearbyChurch[]
  user: User
  signal?: AbortSignal
}

/* =======================
   Main Class
======================= */

export class CalculateChurchRouteDistancesUseCase {
  constructor(private readonly routingProvider: IChurchRoutingProvider) {}

  async findNearest(
    { churches, user, signal }: FindNearestProps,
    profile?: RoutingProfile,
  ): Promise<Result<NearbyChurch[], AppError>> {
    if (!churches.length) {
      return err(new EmptyChurchListError())
    }

    const routeResult = await this.routingProvider.getDistances({
      origin: {
        lat: user.userLat,
        lon: user.userLon,
      },
      destinations: churches.map((church) => ({
        lat: church.lat,
        lon: church.lon,
      })),
      profile,
      signal,
    })

    if (isErr(routeResult)) {
      return routeResult
    }

    const results = routeResult.value

    const rankedChurches = results
      .map((result: RouteDistanceResult, index) => {
        // status !== 0 means unreachable (optional safety)
        if (!result || result.distance == null || (result.status != null && result.status !== 0)) return null

        return {
          ...churches[index],
          distanceKm: result.distance,
          distanceMeters: result.distance * 1000,
        }
      })
      .filter((church): church is NearbyChurch => church !== null)
      .sort((firstChurch, secondChurch) => firstChurch.distanceKm - secondChurch.distanceKm)

    if (!rankedChurches.length) {
      return err(new NoNearbyChurchesFoundError())
    }

    return ok(rankedChurches)
  }
}
