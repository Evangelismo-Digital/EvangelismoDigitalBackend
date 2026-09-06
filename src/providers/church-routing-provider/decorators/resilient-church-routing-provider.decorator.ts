import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { IRawChurchRoutingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Deadline } from 'core/shared/deadline'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Result, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runWithRetries } from 'providers/helpers/deadline-retry'
import { checkAdmission } from 'providers/helpers/provider-admission'
import { collectMetricsProviderLatency, recordProviderRequest } from '@lib/metrics/provider-metrics'
import Redis from 'ioredis'

export class ResilientChurchRoutingProviderDecorator implements IChurchRoutingProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawChurchRoutingProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  /**
   * Unlike the address and geocoding layers there is no chain above this one —
   * routing has a single provider by design — so this decorator records its own
   * provider metrics rather than leaving them to a caller.
   */
  async getDistances(params: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    deadline?: Deadline
  }): Promise<Result<RouteDistanceResult[], AppError>> {
    const deadline = params.deadline ?? Deadline.none()

    const admission = await checkAdmission({
      deadline,
      providerName: this.providerName,
      rateLimitConfig: this.rawProvider.rateLimitConfig,
      redis: this.redisRateLimiterConnection,
    })

    if (isErr(admission)) {
      recordProviderRequest('routing', this.providerName, admission)
      return admission
    }

    return await this.fetchDistances(params, deadline)
  }

  private async fetchDistances(
    params: { origin: RoutingPoint; destinations: RoutingPoint[]; profile?: RoutingProfile },
    deadline: Deadline,
  ): Promise<Result<RouteDistanceResult[], AppError>> {
    const costing = params.profile ?? this.rawProvider.defaultCosting ?? RoutingProfile.AUTO
    const endTimer = collectMetricsProviderLatency?.startTimer({ provider: this.providerName, layer: 'routing' })

    const outcome = await runWithRetries({
      deadline,
      providerName: this.providerName,
      maxAttempts: this.rawProvider.maxRetries,
      backoffMs: this.rawProvider.backoffMs,
      attemptTimeoutMs: this.rawProvider.timeoutMs,
      action: (attempt) =>
        this.rawProvider.fetchRawDistances(params.origin, params.destinations, costing, attempt.signal),
    })

    endTimer?.()
    recordProviderRequest('routing', this.providerName, outcome)

    return outcome
  }
}
