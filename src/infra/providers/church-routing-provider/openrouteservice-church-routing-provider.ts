import { AxiosInstance } from 'axios'
import { RouteDistanceResult, RoutingPoint } from '@infra/providers/interfaces/church-routing-provider.interface'
import { createHttpClient } from '@infra/http/axios'
import { EnumProviderConfig } from '@infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { IRawChurchRoutingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { OPENROUTESERVICE_CONFIG } from '@common/messages/constants/providers/openrouteservice'
import { UPSTREAM_STATUS } from '@common/constants/upstream-http-status'
import { acceptsMatrixStatus, allUnreachable, readDistanceRow } from './routing-matrix'

interface OpenRouteServiceChurchRoutingProviderConfig {
  /** Matrix base URL; the ORS profile is appended per request. */
  matrixApiUrl: string
  apiToken: string
  defaultCosting?: RoutingProfile
  timeoutMs?: number
}

/** `distances[s][d]` is the distance from source `s` to destination `d`; null when unroutable. */
interface OpenRouteServiceMatrixResponse {
  distances?: Array<Array<number | null> | undefined>
}

/** The app's two routing modes, in ORS's profile vocabulary. */
const ORS_PROFILE_BY_COSTING: Record<RoutingProfile, string> = {
  [RoutingProfile.PEDESTRIAN]: 'foot-walking',
  [RoutingProfile.TRANSPORT]: 'driving-car',
}

/** ORS takes `[lon, lat]`, not `{ lat, lon }`. */
function toLonLat(point: RoutingPoint): [number, number] {
  return [point.lon, point.lat]
}

export class OpenRouteServiceChurchRoutingProvider implements IRawChurchRoutingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'OpenRouteService'
  readonly rateLimitConfig = EnumProviderConfig.OPENROUTESERVICE_ROUTING
  readonly timeoutMs: number
  readonly maxRetries = OPENROUTESERVICE_CONFIG.MAX_RETRIES
  readonly backoffMs = OPENROUTESERVICE_CONFIG.BACKOFF_MS
  readonly defaultCosting?: RoutingProfile

  constructor(private readonly config: OpenRouteServiceChurchRoutingProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? OPENROUTESERVICE_CONFIG.DEFAULT_TIMEOUT_MS
    this.defaultCosting = config.defaultCosting

    this.api = createHttpClient({
      timeout: this.timeoutMs,
    })
  }

  private matrixUrl(profile?: RoutingProfile): string {
    const costing = profile ?? this.config.defaultCosting ?? RoutingProfile.PEDESTRIAN

    return `${this.config.matrixApiUrl.replace(/\/$/, '')}/${ORS_PROFILE_BY_COSTING[costing]}`
  }

  /**
   * Origin at index 0, churches after it. `| undefined` on the generic for the
   * same reason as Stadia's: axios types an empty body as a valid payload.
   */
  private async postMatrix(
    origin: RoutingPoint,
    destinations: RoutingPoint[],
    profile: RoutingProfile | undefined,
    signal: AbortSignal | undefined,
  ) {
    return await this.api.post<OpenRouteServiceMatrixResponse | undefined>(
      this.matrixUrl(profile),
      {
        locations: [toLonLat(origin), ...destinations.map(toLonLat)],
        sources: [0],
        destinations: destinations.map((_, index) => index + 1),
        metrics: OPENROUTESERVICE_CONFIG.METRICS,
        units: OPENROUTESERVICE_CONFIG.UNITS,
      },
      {
        headers: {
          Authorization: this.config.apiToken,
          'Content-Type': OPENROUTESERVICE_CONFIG.CONTENT_TYPE,
        },
        validateStatus: acceptsMatrixStatus,
        signal,
      },
    )
  }

  async fetchRawDistances(
    origin: RoutingPoint,
    destinations: RoutingPoint[],
    profile?: RoutingProfile,
    signal?: AbortSignal,
  ): Promise<RouteDistanceResult[]> {
    const response = await this.postMatrix(origin, destinations, profile, signal)
    const row = response.data?.distances?.at(0)

    if (response.status === UPSTREAM_STATUS.NOT_FOUND || !row) {
      return allUnreachable(destinations.length)
    }

    return readDistanceRow(row, destinations.length)
  }
}
