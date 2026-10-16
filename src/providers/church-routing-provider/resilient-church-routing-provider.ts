import { logger } from '@lib/logger'
import { AppError, NoNearbyChurchesFoundError, NoRoutingProviderError } from 'errors'
import {
  IChurchRoutingProvider,
  RouteDistanceResult,
  RoutingPoint,
} from 'core/contracts/use-cases/providers/church-routing-provider.interface'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'
import { Deadline } from 'core/shared/deadline'
import { Result } from 'core/shared/result'
import { ProviderChainNarrator, runProviderChain } from 'providers/helpers/provider-chain'

/**
 * ResilientChurchRoutingProvider chains `IChurchRoutingProvider`s and advances
 * to the next one whenever the current one fails with a `RETRYABLE` failure
 * mode — the same walk as the address and geocoding chains, from
 * `providers/helpers/provider-chain`.
 *
 * A matrix that comes back is the answer, even when every destination in it is
 * unreachable: that is the provider saying "nothing within walking reach", not
 * a failure worth asking someone else about.
 */
const routingNarrator: ProviderChainNarrator = {
  success(providerName) {
    logger.info({ provider: providerName }, 'Distâncias obtidas com sucesso por um provedor de rotas')
  },

  emptyResult(providerName) {
    logger.info({ provider: providerName }, 'Provedor de rotas retornou null - tentando próximo')
  },

  notFound(providerName) {
    logger.info({ provider: providerName }, 'Rotas não encontradas - tentando próximo')
  },

  retryable(providerName, attempt, error) {
    logger.warn(
      { provider: providerName, attempt, error },
      'Provedor de rotas retornou erro recuperável. Alternando para o próximo provedor...',
    )
  },

  fatal(providerName, error) {
    logger.error({ provider: providerName, error }, 'Provedor de rotas retornou erro fatal. Abortando cadeia.')
  },

  allNotFound(notFoundCount, totalProviders) {
    logger.warn({ notFoundCount, totalProviders }, 'Nenhum provedor de rotas retornou resultados')
  },

  systemFailure(providerName, _notFoundCount, error) {
    logger.error({ provider: providerName, error }, 'Cálculo de rotas falhou com erros de sistema')
  },
}

export class ResilientChurchRoutingProvider implements IChurchRoutingProvider {
  constructor(private readonly providers: IChurchRoutingProvider[]) {
    if (this.providers.length === 0) {
      throw new NoRoutingProviderError()
    }
  }

  async getDistances(params: {
    origin: RoutingPoint
    destinations: RoutingPoint[]
    profile?: RoutingProfile
    deadline?: Deadline
  }): Promise<Result<RouteDistanceResult[], AppError>> {
    // Every provider answers with a list or an error, never null, so the
    // chain's `TValue | null` collapses back to the list.
    return (await runProviderChain<IChurchRoutingProvider, RouteDistanceResult[]>({
      providers: this.providers,
      layer: 'routing',
      narrator: routingNarrator,
      allNotFoundError: () => new NoNearbyChurchesFoundError(),
      deadline: params.deadline ?? Deadline.none(),
      attempt: async (provider, deadline) => await provider.getDistances({ ...params, deadline }),
    })) as Result<RouteDistanceResult[], AppError>
  }
}
