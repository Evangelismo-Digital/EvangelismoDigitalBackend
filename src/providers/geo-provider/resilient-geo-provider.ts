import { logger } from '@lib/logger'
import { NoGeoProviderError } from './error/no-geo-provider-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { Deadline } from 'core/shared/deadline'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { ProviderChainNarrator, runProviderChain } from 'providers/helpers/provider-chain'

/**
 * ResilientGeoProvider chains multiple `IGeocodingProvider` implementations and
 * advances to the next provider whenever the current one returns a `RETRYABLE`
 * failure mode. It bails immediately for any other failure mode (NOT_FOUND,
 * unknown / no failure mode).
 *
 * The walk itself lives in `providers/helpers/provider-chain`, shared with the
 * address chain. What stays here is the geocoding-specific part: two entry
 * points (free-text and structured search) over the same chain, the error
 * raised when nothing resolves, and the wording of the logs.
 */

/** What the chain says about a single provider's answer. */
const perProviderEvents: Omit<ProviderChainNarrator, 'allNotFound' | 'systemFailure'> = {
  success(providerName) {
    logger.info({ provider: providerName }, 'Geocodificação obtida com sucesso por um provedor de geocodificação')
  },

  emptyResult(providerName) {
    logger.info({ provider: providerName }, 'Provedor retornou null (não encontrado) - tentando próximo')
  },

  notFound(providerName) {
    logger.info({ provider: providerName }, 'Coordenadas não encontradas - tentando próximo')
  },

  retryable(providerName, attempt, error) {
    logger.warn(
      { provider: providerName, attempt, error },
      'Provedor de geocodificação retornou erro recuperável. Alternando para o próximo provedor...',
    )
  },

  fatal(providerName, error) {
    logger.error({ provider: providerName, error }, 'Provedor retornou erro fatal. Abortando cadeia.')
  },
}

/** What the chain says once every provider has been asked. */
const chainOutcomeEvents: Pick<ProviderChainNarrator, 'allNotFound' | 'systemFailure'> = {
  allNotFound(notFoundCount, totalProviders) {
    logger.warn({ notFoundCount, totalProviders }, 'Nenhum provedor retornou resultados - coordenadas não encontradas')
  },

  systemFailure(providerName, _notFoundCount, error) {
    logger.error({ provider: providerName, error }, 'Geocodificação falhou com erros de sistema')
  },
}

/** Fixed, unlike the address chain's: no per-lookup value appears in these logs. */
const geoNarrator: ProviderChainNarrator = { ...perProviderEvents, ...chainOutcomeEvents }

export class ResilientGeoProvider implements IGeocodingProvider {
  constructor(private readonly providers: IGeocodingProvider[]) {
    if (this.providers.length === 0) {
      throw new NoGeoProviderError()
    }
  }

  async search(query: string, deadline: Deadline = Deadline.none()): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeStrategy(async (provider, inner) => await provider.search(query, inner), deadline)
  }

  async searchStructured(
    options: IGeoSearchOptions,
    deadline: Deadline = Deadline.none(),
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeStrategy(
      async (provider, inner) => await provider.searchStructured(options, inner),
      deadline,
    )
  }

  private async executeStrategy(
    attempt: (provider: IGeocodingProvider, deadline: Deadline) => Promise<Result<IGeoCoordinates | null, AppError>>,
    deadline: Deadline,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await runProviderChain<IGeocodingProvider, IGeoCoordinates>({
      providers: this.providers,
      layer: 'geocoding',
      narrator: geoNarrator,
      allNotFoundError: () => new CoordinatesNotFoundError(),
      deadline,
      attempt,
    })
  }
}
