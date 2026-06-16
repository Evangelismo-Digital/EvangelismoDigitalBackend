import { IAddressProvider, IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { FindNearestChurchesErrorMapper } from 'errors/mappings/find-nearest-churches-error-mapper'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { logger } from '@lib/logger'
import Redis from 'ioredis'

export class ResilientAddressProviderDecorator implements IAddressProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawAddressProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  async fetchAddress(cep: string, signal?: AbortSignal): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

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
        const data = await this.rawProvider.fetchRawAddress(cleanCep, signal)
        return ok(data)
      } catch (error) {
        const appError = FindNearestChurchesErrorMapper.map(error)
        const isRetryable = appError.failureMode === FailureMode.RETRYABLE

        if (!isRetryable || attempt === this.rawProvider.maxRetries) {
          logger.error(
            {
              cep: cleanCep,
              attempt,
              error: appError.message,
            },
            `Falha ao buscar endereço ${this.rawProvider.providerName} após tentativas`,
          )
          return errOf(appError)
        }

        const delay = this.rawProvider.backoffMs * Math.pow(2, attempt - 1)
        logger.warn({ cep: cleanCep, attempt, delay }, `Repetindo solicitação para ${this.rawProvider.providerName}`)
        await this.sleep(delay)
      }
    }

    logger.error({ cep: cleanCep }, `${this.rawProvider.providerName} - todas as tentativas esgotadas sem sucesso`)
    return errOf(new ServiceBusyError(this.rawProvider.providerName))
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
