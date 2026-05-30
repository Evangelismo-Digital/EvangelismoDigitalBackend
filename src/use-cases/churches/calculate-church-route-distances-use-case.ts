import { NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'

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
}

/* =======================
   Main Class
======================= */

export class CalculateChurchRouteDistancesUseCase {
  constructor(private readonly routingProvider: IChurchRoutingProvider) {}

  async findNearest({ churches, user }: FindNearestProps): Promise<NearbyChurch> {
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
    })

    let nearestChurch: NearbyChurch | null = null
    let minDistanceKm = Number.POSITIVE_INFINITY

    results.forEach((result: RouteDistanceResult, index) => {
      // status !== 0 means unreachable (optional safety)
      if (!result || result.distance == null || (result.status != null && result.status !== 0)) return

      if (result.distance < minDistanceKm) {
        minDistanceKm = result.distance

        nearestChurch = {
          ...churches[index],
          distanceKm: result.distance,
          distanceMeters: result.distance * 1000,
        }
      }
    })

    if (!nearestChurch) {
      throw new Error('Nenhuma igreja próxima encontrada!')
    }

    return nearestChurch
  }
}
