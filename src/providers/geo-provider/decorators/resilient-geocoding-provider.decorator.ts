import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Deadline } from 'core/shared/deadline'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runGuardedAttempt } from 'providers/helpers/guarded-attempt'
import Redis from 'ioredis'

export class ResilientGeocodingProviderDecorator implements IGeocodingProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawGeocodingProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  async search(query: string, deadline: Deadline = Deadline.none()): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeResiliently(
      async (attempt) => await this.rawProvider.searchRaw(query, attempt.signal),
      { query },
      deadline,
    )
  }

  async searchStructured(
    options: IGeoSearchOptions,
    deadline: Deadline = Deadline.none(),
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeResiliently(
      async (attempt) => await this.rawProvider.searchStructuredRaw(options, attempt.signal),
      { options },
      deadline,
    )
  }

  // No `metricsLayer`: ResilientGeoProvider records them while walking the chain.
  private async executeResiliently(
    action: (attemptDeadline: Deadline) => Promise<IGeoCoordinates | null>,
    logContext: Record<string, unknown>,
    deadline: Deadline,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      deadline,
      logContext,
      action,
    })
  }
}
