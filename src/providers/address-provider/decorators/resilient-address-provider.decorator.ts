import { IAddressProvider, IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { IRawAddressProvider } from 'core/contracts/use-cases/providers/raw-providers.interface'
import { Deadline } from 'core/shared/deadline'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { runGuardedAttempt } from 'providers/helpers/guarded-attempt'
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

    // No `metricsLayer`: ResilientAddressProvider times and counts each provider
    // as it walks the chain, so recording here as well would double it.
    return await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      logContext: { cep: cleanCep },
      action: async (attempt) => await this.rawProvider.fetchRawAddress(cleanCep, attempt.signal),
      deadline,
    })
  }
}
