import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from '@infra/providers/interfaces/geo-provider.interface'
import { IRawGeocodingProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { Deadline } from '@common/utils/deadline'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { runGuardedAttempt } from '@infra/providers/helpers/guarded-attempt'
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

  // Metrics are recorded by ResilientGeoProvider while walking the chain.
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
