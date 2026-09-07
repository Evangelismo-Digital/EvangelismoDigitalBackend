import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { ROUTING_MAX_DISTANCE_KM } from 'messages/constants/churches/churches'
import { Deadline } from 'core/shared/deadline'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'

/* =======================
   Input Types
======================= */

interface User {
  userLat: number
  userLon: number
}

export interface FindNearestProps {
  churches: NearbyChurch[]
  user: User
  deadline?: Deadline
}

/* =======================
   Main Class
======================= */

/**
 * The ceiling for the profile actually being routed.
 *
 * Falls back to PEDESTRIAN — the costing the provider itself defaults to, and
 * the most conservative of the ten — so an unspecified profile can never widen
 * the cut-off by accident.
 */
function maxDistanceFor(profile?: RoutingProfile): number {
  return ROUTING_MAX_DISTANCE_KM[profile ?? RoutingProfile.PEDESTRIAN]
}

/**
 * Pairs each church with its routed distance, dropping the unreachable ones and
 * ordering by proximity. A `status` other than 0 means the provider could not
 * route to it.
 */
function rankByDistance(
  churches: NearbyChurch[],
  results: RouteDistanceResult[],
  maxDistanceKm: number,
): NearbyChurch[] {
  return results
    .map((_result: RouteDistanceResult, index) => {
      // Read through `.at()` so "no row for this destination" is a case the
      // type system knows about; `results[index]` claims one always exists.
      const result = results.at(index)

      if (result?.distance == null || (result.status != null && result.status !== 0)) {
        return null
      }

      return {
        ...churches[index],
        distanceKm: result.distance,
        distanceMeters: result.distance * 1000,
      }
    })
    .filter((church): church is NearbyChurch => church !== null && church.distanceKm <= maxDistanceKm)
    .sort((firstChurch, secondChurch) => firstChurch.distanceKm - secondChurch.distanceKm)
}

export class CalculateChurchRouteDistancesUseCase {
  constructor(private readonly routingProvider: IChurchRoutingProvider) {}

  async findNearest(
    { churches, user, deadline }: FindNearestProps,
    profile?: RoutingProfile,
  ): Promise<Result<NearbyChurch[], AppError>> {
    if (!churches.length) {
      return err(new EmptyChurchListError())
    }

    const routeResult = await this.routingProvider.getDistances({
      origin: { lat: user.userLat, lon: user.userLon },
      destinations: churches.map((church) => ({ lat: church.lat, lon: church.lon })),
      profile,
      deadline,
    })

    if (isErr(routeResult)) {
      return routeResult
    }

    // The KNN step has no distance cut-off of its own — it always yields the
    // geometrically nearest candidates, however far away. Without this ceiling a
    // user in a sparse region is handed a church hundreds of kilometres away and
    // told to walk. Applied here rather than in the query so the cut is made on
    // the routed distance a person would actually travel.
    const rankedChurches = rankByDistance(churches, routeResult.value, maxDistanceFor(profile))

    if (!rankedChurches.length) {
      return err(new NoNearbyChurchesFoundError())
    }

    return ok(rankedChurches)
  }
}
