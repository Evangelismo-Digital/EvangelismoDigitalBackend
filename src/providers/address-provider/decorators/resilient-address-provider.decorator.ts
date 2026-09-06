import { IAddressProvider, IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Deadline } from 'core/shared/deadline'
import { Result, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runWithRetries } from 'providers/helpers/deadline-retry'
import { checkAdmission } from 'providers/helpers/provider-admission'
import Redis from 'ioredis'

export class ResilientAddressProviderDecorator implements IAddressProvider {
  readonly providerName: string

  constructor(
    private readonly rawProvider: IRawAddressProvider,
    private readonly redisRateLimiterConnection: Redis,
  ) {
    this.providerName = rawProvider.providerName
  }

  async fetchAddress(
    cep: string,
    deadline: Deadline = Deadline.none(),
  ): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

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
      logContext: { cep: cleanCep },
      action: (attempt) => this.rawProvider.fetchRawAddress(cleanCep, attempt.signal),
    })
  }
}
