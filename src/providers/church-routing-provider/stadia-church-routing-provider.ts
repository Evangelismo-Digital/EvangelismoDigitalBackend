import { AxiosInstance } from 'axios'
import { RouteDistanceResult, RoutingPoint } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { STADIA_CONFIG } from 'messages/constants/providers/stadia'

interface StadiaChurchRoutingProviderConfig {
  apiUrl: string
  apiToken: string
  defaultCosting?: RoutingProfile
  timeoutMs?: number
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

export class StadiaChurchRoutingProvider implements IRawChurchRoutingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'Stadia Maps'
  readonly rateLimitConfig = EnumProviderConfig.STADIA_ROUTING
  readonly timeoutMs: number
  readonly defaultCosting?: RoutingProfile

  constructor(private readonly config: StadiaChurchRoutingProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? STADIA_CONFIG.DEFAULT_TIMEOUT_MS
    this.defaultCosting = config.defaultCosting

    this.api = createHttpClient({
      timeout: this.timeoutMs,
    })
  }

  async fetchRawDistance(
    origin: RoutingPoint,
    destination: RoutingPoint,
    profile?: RoutingProfile,
    signal?: AbortSignal,
  ): Promise<RouteDistanceResult> {
    const costing = profile ?? this.config.defaultCosting ?? RoutingProfile.AUTO

    const response = await this.api.post(
      this.config.apiUrl.replace(/\/$/, ''),
      {
        locations: [
          { lat: origin.lat, lon: origin.lon },
          { lat: destination.lat, lon: destination.lon },
        ],
        costing,
        directions_options: {
          units: STADIA_CONFIG.UNITS,
        },
      },
      {
        headers: {
          Authorization: `${STADIA_CONFIG.AUTH_PREFIX} ${this.config.apiToken}`,
          'Content-Type': STADIA_CONFIG.CONTENT_TYPE,
        },
        signal,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
      },
    )

    if (response.status === 404) {
      return {
        distance: null,
        status: 404,
      }
    }

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
