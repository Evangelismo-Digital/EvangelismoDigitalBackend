import { Deadline } from '@common/utils/deadline'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'

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
    deadline?: Deadline
  }): Promise<Result<RouteDistanceResult[], AppError>>
}
