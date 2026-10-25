import { IAddressProvider, IAddressData } from '@infra/providers/interfaces/address-provider.interface'
import { IRawAddressProvider } from '@infra/providers/interfaces/raw-providers.interface'
import { Deadline } from '@common/utils/deadline'
import { Result, isOk, ok } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
import { runGuardedAttempt } from '@infra/providers/helpers/guarded-attempt'
import Redis from 'ioredis'
import { getStateByCep } from '@brazilian-utils/brazilian-utils'
import { logger } from '@infra/logger'

/**
 * True when the address places the CEP in a state other than the one owning
 * its Correios range — an answer that cannot be right. BrasilAPI's crowd-sourced
 * `open-cep` source does this (99999999, an RS range, "found" in Sarandi/PR),
 * and taking it sends the search ~800 km away. A CEP outside every range, or an
 * address with no state, cannot be judged and is left alone.
 */
function contradictsCepRange(cep: string, address: IAddressData): boolean {
  const owner = getStateByCep(cep)?.code

  return owner !== undefined && Boolean(address.uf) && address.uf.trim().toUpperCase() !== owner
}

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
    const result = await runGuardedAttempt({
      rawProvider: this.rawProvider,
      redis: this.redisRateLimiterConnection,
      logContext: { cep: cleanCep },
      action: async (attempt) => await this.rawProvider.fetchRawAddress(cleanCep, attempt.signal),
      deadline,
    })

    // Discarded as "not found" rather than as an error, so the chain asks the
    // next provider and, when nobody answers consistently, ends in INVALID_CEP.
    if (isOk(result) && result.value && contradictsCepRange(cleanCep, result.value)) {
      logger.warn(
        { cep: cleanCep, provider: this.providerName, uf: result.value.uf },
        'Endereço descartado: a UF não corresponde à faixa de CEP dos Correios',
      )
      return ok(null)
    }

    return result
  }
}
