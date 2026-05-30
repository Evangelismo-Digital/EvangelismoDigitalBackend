export interface RoutingPoint {
  lat: number
  lon: number
}

export interface RouteDistanceResult {
  distance: number | null
  status?: number
}

export interface IChurchRoutingProvider {
  getDistances(params: { origin: RoutingPoint; destinations: RoutingPoint[] }): Promise<RouteDistanceResult[]>
}