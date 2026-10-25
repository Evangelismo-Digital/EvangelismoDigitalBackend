import { AxiosInstance } from 'axios'
import { RouteDistanceResult, RoutingPoint } from '@infra/providers/interfaces/church-routing-provider.interface'
import { createHttpClient } from '@infra/http/axios'
import { EnumProviderConfig } from '@infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { IRawChurchRoutingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { STADIA_CONFIG } from '@common/messages/constants/providers/stadia'
import { UPSTREAM_STATUS } from '@common/constants/upstream-http-status'
import { acceptsMatrixStatus, allUnreachable, readDistanceRow } from './routing-matrix'

interface StadiaChurchRoutingProviderConfig {
  /** Batch matrix endpoint — the only Stadia route this provider calls. */
  matrixApiUrl: string
  apiToken: string
  defaultCosting?: RoutingProfile
  timeoutMs?: number
}

interface StadiaMatrixEntry {
  distance: number | null
  time: number | null
}

interface StadiaMatrixResponse {
  sources_to_targets: Array<Array<StadiaMatrixEntry | undefined> | undefined>
}

/** The app's two routing modes, as Valhalla costings. */
const STADIA_COSTING_BY_PROFILE: Record<RoutingProfile, string> = {
  [RoutingProfile.PEDESTRIAN]: 'pedestrian',
  [RoutingProfile.TRANSPORT]: 'auto',
}

/** A 404, or a response carrying no rows at all, means nothing is reachable. */
function isEmptyMatrix(status: number, data: StadiaMatrixResponse): boolean {
  return status === UPSTREAM_STATUS.NOT_FOUND || !data.sources_to_targets.length
}

export class StadiaChurchRoutingProvider implements IRawChurchRoutingProvider {
  private readonly api: AxiosInstance

  readonly providerName = 'Stadia Maps'
  readonly rateLimitConfig = EnumProviderConfig.STADIA_ROUTING
  readonly timeoutMs: number
  readonly maxRetries = STADIA_CONFIG.MAX_RETRIES
  readonly backoffMs = STADIA_CONFIG.BACKOFF_MS
  readonly defaultCosting?: RoutingProfile

  constructor(private readonly config: StadiaChurchRoutingProviderConfig) {
    this.timeoutMs = config.timeoutMs ?? STADIA_CONFIG.DEFAULT_TIMEOUT_MS
    this.defaultCosting = config.defaultCosting

    this.api = createHttpClient({
      timeout: this.timeoutMs,
    })
  }

  private resolveCosting(profile?: RoutingProfile): string {
    return STADIA_COSTING_BY_PROFILE[profile ?? this.config.defaultCosting ?? RoutingProfile.PEDESTRIAN]
  }

  /**
   * The HTTP call itself, kept apart from the interpretation of its answer.
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
    return await this.api.post<StadiaMatrixResponse | undefined>(
      this.config.matrixApiUrl.replace(/\/$/, ''),
      {
        sources: [{ lat: origin.lat, lon: origin.lon }],
        targets: destinations.map((d) => ({ lat: d.lat, lon: d.lon })),
        costing: this.resolveCosting(profile),
        units: STADIA_CONFIG.UNITS,
      },
      {
        headers: {
          Authorization: `${STADIA_CONFIG.AUTH_PREFIX} ${this.config.apiToken}`,
          'Content-Type': STADIA_CONFIG.CONTENT_TYPE,
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

    const matrix = response.data

    if (!matrix || isEmptyMatrix(response.status, matrix)) {
      return allUnreachable(destinations.length)
    }

    // sources_to_targets[0] = results from source[0] to all targets
    const row = matrix.sources_to_targets.at(0)

    return readDistanceRow(
      row?.map((entry) => entry?.distance),
      destinations.length,
    )
  }
}
