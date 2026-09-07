import { AxiosInstance } from 'axios'
import { RouteDistanceResult, RoutingPoint } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { STADIA_CONFIG } from 'messages/constants/providers/stadia'
import {
  UPSTREAM_STATUS,
  UPSTREAM_SUCCESS_MIN,
  UPSTREAM_SUCCESS_MAX_EXCLUSIVE,
} from 'core/constants/upstream-http-status'

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
  sources_to_targets: StadiaMatrixEntry[][]
}

/** A 404, or a response carrying no rows at all, means nothing is reachable. */
function isEmptyMatrix(status: number, data: StadiaMatrixResponse | undefined): boolean {
  return status === UPSTREAM_STATUS.NOT_FOUND || !data?.sources_to_targets.length
}

/**
 * Reads one matrix row into a per-destination result, treating a missing or
 * distance-less entry as unreachable rather than as an error.
 */
function readMatrixRow(row: StadiaMatrixEntry[] | undefined, destinationCount: number): RouteDistanceResult[] {
  return Array.from({ length: destinationCount }, (_, index) => {
    const entry = row?.[index]

    if (entry?.distance == null) {
      return { distance: null, status: 0 }
    }

    return { distance: entry.distance, status: 0 }
  })
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

  private resolveCosting(profile?: RoutingProfile): RoutingProfile {
    return profile ?? this.config.defaultCosting ?? RoutingProfile.AUTO
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
        // A 404 is a real answer here ("nothing reachable"), not a transport
        // failure, so axios must not throw on it.
        validateStatus: (status) =>
          (status >= UPSTREAM_SUCCESS_MIN && status < UPSTREAM_SUCCESS_MAX_EXCLUSIVE) ||
          status === UPSTREAM_STATUS.NOT_FOUND,
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
      return destinations.map(() => ({ distance: null, status: UPSTREAM_STATUS.NOT_FOUND }))
    }

    // sources_to_targets[0] = results from source[0] to all targets
    return readMatrixRow(matrix.sources_to_targets[0], destinations.length)
  }
}
