import { logger } from '@lib/logger'
import { NoAddressProviderError } from './error/no-address-provider-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Deadline } from 'core/shared/deadline'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ProviderChainNarrator, runProviderChain } from 'providers/helpers/provider-chain'

/**
 * ResilientAddressProvider chains multiple `IAddressProvider` implementations
 * and advances to the next provider whenever the current one returns a
 * `RETRYABLE` failure mode. It bails immediately for any other failure mode
 * (NOT_FOUND, unknown / no failure mode).
 *
 * The walk itself lives in `providers/helpers/provider-chain` — it is identical
 * to the geocoding chain's, and keeping one copy is what stops the two from
 * drifting. What remains here is what is genuinely specific to addresses: the
 * CEP normalisation, the error raised when every provider rejects the CEP, and
 * the wording of the log lines (which carry the CEP where it helps an operator
 * trace a single lookup).
 */

/** What the chain says about a single provider's answer. */
function perProviderEvents(cleanCep: string): Omit<ProviderChainNarrator, 'allNotFound' | 'systemFailure'> {
  return {
    success(providerName) {
      logger.info({ provider: providerName }, 'Endereço obtido com sucesso por um provedor de endereço')
    },

    emptyResult(providerName) {
      logger.info({ provider: providerName }, 'Provedor retornou null (não encontrado) - tentando próximo')
    },

    notFound(providerName) {
      logger.info(
        { provider: providerName, cep: cleanCep },
        'Provedor confirmou que o recurso não existe - tentando próximo',
      )
    },

    retryable(providerName, attempt, error) {
      logger.warn(
        { provider: providerName, attempt, error },
        'Provedor de endereço retornou erro recuperável. Alternando para o próximo provedor...',
      )
    },

    fatal(providerName, error) {
      logger.error({ provider: providerName, error }, 'Provedor retornou erro fatal. Abortando cadeia.')
    },
  }
}

/** What the chain says once every provider has been asked. */
function chainOutcomeEvents(cleanCep: string): Pick<ProviderChainNarrator, 'allNotFound' | 'systemFailure'> {
  return {
    allNotFound(notFoundCount, totalProviders) {
      logger.warn(
        { cep: cleanCep, notFoundCount, totalProviders },
        'TODOS os provedores confirmaram CEP inválido/não encontrado',
      )
    },

    systemFailure(providerName, notFoundCount, error) {
      logger.error(
        { cep: cleanCep, provider: providerName, notFoundCount, error },
        'Provedores de endereço falharam com erros de sistema',
      )
    },
  }
}

function addressNarrator(cleanCep: string): ProviderChainNarrator {
  return { ...perProviderEvents(cleanCep), ...chainOutcomeEvents(cleanCep) }
}

export class ResilientAddressProvider implements IAddressProvider {
  constructor(private readonly providers: IAddressProvider[]) {
    if (this.providers.length === 0) {
      throw new NoAddressProviderError()
    }
  }

  async fetchAddress(
    cep: string,
    deadline: Deadline = Deadline.none(),
  ): Promise<Result<IAddressData | null, AppError>> {
    const cleanCep = cep.replace(/\D/g, '')

    return await runProviderChain<IAddressProvider, IAddressData>({
      providers: this.providers,
      layer: 'address',
      narrator: addressNarrator(cleanCep),
      allNotFoundError: () => new InvalidCepError(),
      attempt: async (provider, inner) => await provider.fetchAddress(cleanCep, inner),
      deadline,
    })
  }
}
