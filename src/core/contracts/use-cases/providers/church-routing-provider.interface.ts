import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

export interface RoutingPoint {
  lat: number
  lon: number
}

export interface RouteDistanceResult {
  distance: number | null
  status?: number
}

export interface IChurchRoutingProvider {
  getDistances(params: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    signal?: AbortSignal
  }): Promise<Result<RouteDistanceResult[], AppError>>
}
