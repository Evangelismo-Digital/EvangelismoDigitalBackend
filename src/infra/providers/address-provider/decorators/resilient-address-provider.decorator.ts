import { IAddressProvider, IAddressData } from '@infra/providers/interfaces/address-provider.interface'
import { IRawAddressProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { Deadline } from '@common/utils/deadline'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { runGuardedAttempt } from '@infra/providers/helpers/guarded-attempt'
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

    // No metrics here: ResilientAddressProvider times and counts each provider
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
