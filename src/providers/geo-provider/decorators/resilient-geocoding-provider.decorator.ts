import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IRawGeocodingProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { FindNearestChurchesErrorMapper } from 'errors/mappings/find-nearest-churches-error-mapper'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { logger } from '@lib/logger'
import Redis from 'ioredis'

export class ResilientGeocodingProviderDecorator implements IGeocodingProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawGeocodingProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  async search(query: string, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>> {
    return this.executeResiliently((sig) => this.rawProvider.searchRaw(query, sig), { query }, signal)
  }

  async searchStructured(
    options: IGeoSearchOptions,
    signal?: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return this.executeResiliently((sig) => this.rawProvider.searchStructuredRaw(options, sig), { options }, signal)
  }

  private async executeResiliently(
    action: (signal?: AbortSignal) => Promise<IGeoCoordinates | null>,
    logContext: Record<string, any>,
    signal?: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    // 1. Rate Limit check
    const rateLimiter = RedisRateLimiter.getInstance(this.redisRateLimiterConnection)
    const allowed = await rateLimiter.tryConsume(this.rawProvider.rateLimitConfig)

    if (!allowed) {
      return errOf(new ServiceBusyError(this.rawProvider.providerName))
    }

    // 2. Retry Loop
    for (let attempt = 1; attempt <= this.rawProvider.maxRetries; attempt++) {
      if (signal?.aborted) {
        return errOf(new TimeoutExceededError(signal.reason))
      }

      try {
        const data = await action(signal)
        return ok(data)
      } catch (error) {
        const appError = FindNearestChurchesErrorMapper.map(error)
        const isRetryable = appError.failureMode === FailureMode.RETRYABLE

        if (!isRetryable || attempt === this.rawProvider.maxRetries) {
          logger.error(
            {
              ...logContext,
              attempt,
              error: appError.message,
            },
            `Falha ao buscar coordenadas geográficas ${this.rawProvider.providerName} após tentativas`,
          )
          return errOf(appError)
        }

        const delay = this.rawProvider.backoffMs * Math.pow(2, attempt - 1)
        logger.warn({ ...logContext, attempt, delay }, `Repetindo solicitação para ${this.rawProvider.providerName}`)
        await this.sleep(delay)
      }
    }

    logger.error(logContext, `${this.rawProvider.providerName} - todas as tentativas esgotadas sem sucesso`)
    return errOf(new ServiceBusyError(this.rawProvider.providerName))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
