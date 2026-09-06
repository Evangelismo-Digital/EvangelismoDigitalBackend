import { AxiosInstance } from 'axios'
import { RouteDistanceResult, RoutingPoint } from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { createHttpClient } from '@lib/http/axios'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { STADIA_CONFIG } from 'messages/constants/providers/stadia'

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
  return status === 404 || !data?.sources_to_targets?.length
}

/**
 * Reads one matrix row into a per-destination result, treating a missing or
 * distance-less entry as unreachable rather than as an error.
 */
function readMatrixRow(row: StadiaMatrixEntry[] | undefined, destinationCount: number): RouteDistanceResult[] {
  return Array.from({ length: destinationCount }, (_, index) => {
    const entry = row?.[index]

    if (!entry || entry.distance == null) {
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

  async fetchRawDistances(
    origin: RoutingPoint,
    destinations: RoutingPoint[],
    profile?: RoutingProfile,
    signal?: AbortSignal,
  ): Promise<RouteDistanceResult[]> {
    const response = await this.api.post<StadiaMatrixResponse>(
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
        signal,
        validateStatus: (status) => (status >= 200 && status < 300) || status === 404,
      },
    )

    if (isEmptyMatrix(response.status, response.data)) {
      return destinations.map(() => ({ distance: null, status: 404 }))
    }

    // sources_to_targets[0] = results from source[0] to all targets
    return readMatrixRow(response.data.sources_to_targets[0], destinations.length)
  }
}
