import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Deadline } from 'core/shared/deadline'
import { Result, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runWithRetries } from 'providers/helpers/deadline-retry'
import { checkAdmission } from 'providers/helpers/provider-admission'
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
      (attempt) => this.rawProvider.searchRaw(query, attempt.signal),
      { query },
      deadline,
    )
  }

  async searchStructured(
    options: IGeoSearchOptions,
    deadline: Deadline = Deadline.none(),
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeResiliently(
      (attempt) => this.rawProvider.searchStructuredRaw(options, attempt.signal),
      { options },
      deadline,
    )
  }

  private async executeResiliently(
    action: (attemptDeadline: Deadline) => Promise<IGeoCoordinates | null>,
    logContext: Record<string, unknown>,
    deadline: Deadline,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    const admission = await checkAdmission({
      deadline,
      providerName: this.providerName,
      rateLimitConfig: this.rawProvider.rateLimitConfig,
      redis: this.redisRateLimiterConnection,
    })

    if (isErr(admission)) {
      return admission
    }

    return await runWithRetries({
      deadline,
      providerName: this.providerName,
      maxAttempts: this.rawProvider.maxRetries,
      backoffMs: this.rawProvider.backoffMs,
      attemptTimeoutMs: this.rawProvider.timeoutMs,
      logContext,
      action,
    })
  }
}
