import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from '@infra/providers/interfaces/church-routing-provider.interface'
import { IRawChurchRoutingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { Deadline } from '@common/utils/deadline'
import { RoutingProfile } from '@common/types/routing-profile/routing-profile-enum'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { runGuardedAttempt } from '@infra/providers/helpers/guarded-attempt'
import Redis from 'ioredis'

export class ResilientChurchRoutingProviderDecorator implements IChurchRoutingProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawChurchRoutingProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  // Metrics are recorded by ResilientChurchRoutingProvider while walking the chain.
  async getDistances(params: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    deadline?: Deadline
  }): Promise<Result<RouteDistanceResult[], AppError>> {
    const deadline = params.deadline ?? Deadline.none()
    const costing = params.profile ?? this.rawProvider.defaultCosting ?? RoutingProfile.AUTO

    return await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      action: async (attempt) =>
        await this.rawProvider.fetchRawDistances(params.origin, params.destinations, costing, attempt.signal),
      deadline,
    })
  }
}
