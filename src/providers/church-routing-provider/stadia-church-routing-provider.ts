import axios, { AxiosError } from 'axios'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'

interface StadiaChurchRoutingProviderConfig {
  apiUrl: string
  apiToken: string
}

interface StadiaRouteResponse {
  status?: number
  routes?: Array<{
    summary?: {
      length?: number
    }
  }>
  trip?: {
    summary?: {
      length?: number
    }
  }
  distance?: number
}

export class StadiaChurchRoutingProvider implements IChurchRoutingProvider {
  constructor(private readonly config: StadiaChurchRoutingProviderConfig) {}

  async getDistances({ origin, destinations }: { origin: RoutingPoint; destinations: RoutingPoint[] }): Promise<RouteDistanceResult[]> {
    const results: RouteDistanceResult[] = []

    for (const destination of destinations) {
      results.push(await this.fetchDistance(origin, destination))
    }

    return results
  }

  private async fetchDistance(origin: RoutingPoint, destination: RoutingPoint): Promise<RouteDistanceResult> {
    try {
      const response = await axios.post(
        this.config.apiUrl.replace(/\/$/, ''),
        {
          locations: [
            { lat: origin.lat, lon: origin.lon },
            { lat: destination.lat, lon: destination.lon },
          ],
          costing: 'auto',
          directions_options: {
            units: 'kilometers',
          },
        },
        {
          headers: {
            Authorization: `Stadia-Auth ${this.config.apiToken}`,
            'Content-Type': 'application/json',
          },
        },
      )

      const distance = this.extractDistanceKm(response.data)
      const status = response.data?.status

      if (distance == null || (typeof status === 'number' && status !== 0)) {
        return {
          distance: null,
          status: typeof status === 'number' ? status : 0,
        }
      }

      return {
        distance,
        status: typeof status === 'number' ? status : 0,
      }
    } catch (error) {
      const axiosError = error as AxiosError
      const status = axiosError.response?.status

      if (status === 404) {
        return {
          distance: null,
          status,
        }
      }

      throw error
    }
  }

  private extractDistanceKm(responseData: StadiaRouteResponse): number | null {
    if (typeof responseData?.distance === 'number') {
      return responseData.distance
    }

    const routeLength = responseData?.routes?.[0]?.summary?.length
    if (typeof routeLength === 'number') {
      return routeLength
    }

    const tripLength = responseData?.trip?.summary?.length
    if (typeof tripLength === 'number') {
      return tripLength
    }

    return null
  }
}