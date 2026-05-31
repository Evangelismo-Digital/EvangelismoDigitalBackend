import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

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

  async findNearest({ churches, user, signal }: FindNearestProps, profile?: RoutingProfile): Promise<NearbyChurch[]> {
    if (!churches.length) {
      throw new Error('Lista de igrejas vazia!')
    }

    const results = await this.routingProvider.getDistances({
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
      throw new Error('Nenhuma igreja próxima encontrada!')
    }

    return rankedChurches
  }
}
