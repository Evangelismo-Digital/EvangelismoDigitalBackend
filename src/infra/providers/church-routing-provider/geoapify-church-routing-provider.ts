import { AxiosInstance } from 'axios'
import { RouteDistanceResult, RoutingPoint } from '@infra/providers/interfaces/church-routing-provider.interface'
import { createHttpClient } from '@infra/http/axios'
import { EnumProviderConfig } from '@infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { IRawChurchRoutingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { GEOAPIFY_CONFIG } from '@common/messages/constants/providers/geoapify'
import { UPSTREAM_STATUS } from '@common/constants/upstream-http-status'
import { acceptsMatrixStatus, allUnreachable, readDistanceRow } from './routing-matrix'

interface GeoapifyChurchRoutingProviderConfig {
  /** Route Matrix endpoint; the key travels as the `apiKey` query parameter. */
  matrixApiUrl: string
  apiToken: string
  defaultCosting?: RoutingProfile
  timeoutMs?: number
}

interface GeoapifyMatrixEntry {
  /** Meters; null when no route exists for the pair. */
  distance?: number | null
}

/** `sources_to_targets[s][t]` is the route from source `s` to target `t`. */
interface GeoapifyMatrixResponse {
  sources_to_targets?: Array<Array<GeoapifyMatrixEntry | undefined> | undefined>
}

/** The app's two routing modes, in Geoapify's travel-mode vocabulary. */
const GEOAPIFY_MODE_BY_PROFILE: Record<RoutingProfile, string> = {
  [RoutingProfile.PEDESTRIAN]: 'walk',
  [RoutingProfile.TRANSPORT]: 'drive',
}

/** Geoapify takes GeoJSON order, `[lon, lat]`, wrapped in `{ location }`. */
function toWaypoint(point: RoutingPoint): { location: [number, number] } {
  return { location: [point.lon, point.lat] }
}

/** Meters to km, leaving "no route" (null/undefined) as it is. */
function toKm(meters: number | null | undefined): number | null | undefined {
  return meters == null ? meters : meters / GEOAPIFY_CONFIG.METERS_PER_KM
}

export class GeoapifyChurchRoutingProvider implements IRawChurchRoutingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'Geoapify'
  readonly rateLimitConfig = EnumProviderConfig.GEOAPIFY_ROUTING
  readonly timeoutMs: number
  readonly maxRetries = GEOAPIFY_CONFIG.MAX_RETRIES
  readonly backoffMs = GEOAPIFY_CONFIG.BACKOFF_MS
  readonly defaultCosting?: RoutingProfile

  constructor(private readonly config: GeoapifyChurchRoutingProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? GEOAPIFY_CONFIG.DEFAULT_TIMEOUT_MS
    this.defaultCosting = config.defaultCosting

    this.api = createHttpClient({
      timeout: this.timeoutMs,
    })
  }

  private resolveMode(profile?: RoutingProfile): string {
    return GEOAPIFY_MODE_BY_PROFILE[profile ?? this.config.defaultCosting ?? RoutingProfile.PEDESTRIAN]
  }

  /**
   * One source (the user), the churches as targets. `| undefined` on the
   * generic for the same reason as Stadia's: axios types an empty body as a
   * valid payload.
   */
  private async postMatrix(
    origin: RoutingPoint,
    destinations: RoutingPoint[],
    profile: RoutingProfile | undefined,
    signal: AbortSignal | undefined,
  ) {
    return await this.api.post<GeoapifyMatrixResponse | undefined>(
      this.config.matrixApiUrl.replace(/\/$/, ''),
      {
        mode: this.resolveMode(profile),
        sources: [toWaypoint(origin)],
        targets: destinations.map(toWaypoint),
        units: GEOAPIFY_CONFIG.UNITS,
      },
      {
        params: { apiKey: this.config.apiToken },
        headers: { 'Content-Type': GEOAPIFY_CONFIG.CONTENT_TYPE },
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
    const row = response.data?.sources_to_targets?.at(0)

    if (response.status === UPSTREAM_STATUS.NOT_FOUND || !row) {
      return allUnreachable(destinations.length)
    }

    return readDistanceRow(
      row.map((entry) => toKm(entry?.distance)),
      destinations.length,
    )
  }
}
