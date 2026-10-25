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

interface GeoapifyAvoid {
  type: 'ferries'
}

/**
 * What each mode must not route through. Walking avoids ferries: Geoapify's
 * walking router otherwise takes the Rio–Niterói ferry and reports a 7 km
 * "walk" across Guanabara Bay. Driving keeps car ferries where they exist.
 */
const GEOAPIFY_AVOID_BY_PROFILE: Record<RoutingProfile, GeoapifyAvoid[] | undefined> = {
  [RoutingProfile.PEDESTRIAN]: [{ type: 'ferries' }],
  [RoutingProfile.TRANSPORT]: undefined,
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

  private resolveProfile(profile?: RoutingProfile): RoutingProfile {
    return profile ?? this.config.defaultCosting ?? RoutingProfile.PEDESTRIAN
  }

  /** The request body; `avoid` is sent only when the mode has something to avoid. */
  private matrixBody(origin: RoutingPoint, destinations: RoutingPoint[], profile: RoutingProfile | undefined) {
    const resolved = this.resolveProfile(profile)
    const avoid = GEOAPIFY_AVOID_BY_PROFILE[resolved]

    return {
      mode: GEOAPIFY_MODE_BY_PROFILE[resolved],
      sources: [toWaypoint(origin)],
      targets: destinations.map(toWaypoint),
      units: GEOAPIFY_CONFIG.UNITS,
      ...(avoid && { avoid }),
    }
  }

  /**
   * One source (the user), the churches as targets.
   *
   * The generic carries `| undefined` because that is the truth: axios types
   * `response.data` as the generic regardless of what the server sent, so a
   * 204, an empty body or a proxy error page all arrive typed as a valid
   * payload. Saying so is what makes the guard in the caller necessary instead
   * of "unnecessary".
   */
  private async postMatrix(
    origin: RoutingPoint,
    destinations: RoutingPoint[],
    profile: RoutingProfile | undefined,
    signal: AbortSignal | undefined,
  ) {
    return await this.api.post<GeoapifyMatrixResponse | undefined>(
      this.config.matrixApiUrl.replace(/\/$/, ''),
      this.matrixBody(origin, destinations, profile),
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
