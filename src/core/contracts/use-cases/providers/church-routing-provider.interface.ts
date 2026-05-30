import { RoutingProfile } from "core/types/routing-profile/routing-profile-enum"

export interface RoutingPoint {
  lat: number
  lon: number
}

export interface RouteDistanceResult {
  distance: number | null
  status?: number
}

export interface IChurchRoutingProvider {
  getDistances(params: { origin: RoutingPoint; destinations: RoutingPoint[]; profile?: RoutingProfile }): Promise<RouteDistanceResult[]>
}