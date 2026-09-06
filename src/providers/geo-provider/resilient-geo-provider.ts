import { logger } from '@lib/logger'
import { NoGeoProviderError } from './error/no-geo-provider-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { Deadline } from 'core/shared/deadline'
import { Result, ok, err, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import {
  collectMetricsProviderLatency,
  collectMetricsProviderFallback,
  collectMetricsProviderChainExhausted,
  recordProviderRequest,
} from '@lib/metrics/provider-metrics'

/**
 * ResilientGeoProvider chains multiple `IGeocodingProvider` implementations
 * and advances to the next provider whenever the current one returns a
 * `RETRYABLE` failure mode.  It bails immediately for any other failure mode
 * (NOT_FOUND, unknown / no failure mode).
 *
 * No `instanceof` checks are used — routing is driven purely by
 * `error.failureMode`.
 */
/** What the chain has learned so far while walking its providers. */
interface ChainTally {
  notFoundCount: number
  lastRetryableError?: AppError
  lastProviderName?: string
}

function nameOf(provider: IGeocodingProvider): string {
  return (provider as { providerName?: string }).providerName ?? provider.constructor.name
}

export class ResilientGeoProvider implements IGeocodingProvider {
  constructor(private readonly providers: IGeocodingProvider[]) {
    if (this.providers.length === 0) {
      throw new NoGeoProviderError()
    }
  }

  async search(query: string, deadline: Deadline = Deadline.none()): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeStrategy((provider, inner) => provider.search(query, inner), deadline)
  }

  async searchStructured(
    options: IGeoSearchOptions,
    deadline: Deadline = Deadline.none(),
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    return await this.executeStrategy((provider, inner) => provider.searchStructured(options, inner), deadline)
  }

  private async executeStrategy(
    action: (provider: IGeocodingProvider, deadline: Deadline) => Promise<Result<IGeoCoordinates | null, AppError>>,
    deadline: Deadline,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    const tally: ChainTally = { notFoundCount: 0 }

    for (const [index, provider] of this.providers.entries()) {
      // Honour the budget before each provider attempt: with none left, every
      // remaining provider would fail instantly while still costing quota.
      if (deadline.expired) {
        return err(deadline.asError())
      }

      const providerName = nameOf(provider)
      const result = await this.callProvider(action, provider, deadline, providerName)
      const terminal = this.interpret(result, providerName, index, tally)

      if (terminal) {
        return terminal
      }
    }

    return this.decideExhausted(tally)
  }

  private async callProvider(
    action: (provider: IGeocodingProvider, deadline: Deadline) => Promise<Result<IGeoCoordinates | null, AppError>>,
    provider: IGeocodingProvider,
    deadline: Deadline,
    providerName: string,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    const endTimer = collectMetricsProviderLatency?.startTimer({ provider: providerName, layer: 'geocoding' })
    const result = await action(provider, deadline)
    endTimer?.()

    recordProviderRequest('geocoding', providerName, result)

    return result
  }

  /**
   * Turns one provider's outcome into either a terminal result for the whole
   * chain, or `null` meaning "keep going" — recording what we learned in `tally`.
   */
  private interpret(
    result: Result<IGeoCoordinates | null, AppError>,
    providerName: string,
    index: number,
    tally: ChainTally,
  ): Result<IGeoCoordinates | null, AppError> | null {
    if (isOk(result)) {
      return this.interpretSuccess(result.value, providerName, tally)
    }

    const error = result.error

    // NOT_FOUND: resource genuinely missing — treat same as null response
    if (error.failureMode === FailureMode.NOT_FOUND) {
      tally.notFoundCount++
      logger.info({ provider: providerName }, 'Coordenadas não encontradas - tentando próximo')
      return null
    }

    // RETRYABLE: transient infra error — log and advance to next provider
    if (error.failureMode === FailureMode.RETRYABLE) {
      this.noteRetryable(error, providerName, index, tally)
      return null
    }

    // PERMANENT / ABORTED / untagged — bail without trying other providers
    logger.error({ provider: providerName, error }, 'Provedor retornou erro fatal. Abortando cadeia.')
    return err(error)
  }

  private interpretSuccess(
    value: IGeoCoordinates | null,
    providerName: string,
    tally: ChainTally,
  ): Result<IGeoCoordinates | null, AppError> | null {
    if (value !== null) {
      logger.info({ provider: providerName }, 'Geocodificação obtida com sucesso por um provedor de geocodificação')
      return ok(value)
    }

    tally.notFoundCount++
    logger.info({ provider: providerName }, 'Provedor retornou null (não encontrado) - tentando próximo')
    return null
  }

  private noteRetryable(error: AppError, providerName: string, index: number, tally: ChainTally): void {
    tally.lastRetryableError = error
    tally.lastProviderName = providerName

    const nextProvider = this.providers[index + 1]
    if (nextProvider) {
      collectMetricsProviderFallback?.inc({
        layer: 'geocoding',
        from_provider: providerName,
        to_provider: nameOf(nextProvider),
      })
    }

    logger.warn(
      { provider: providerName, attempt: index + 1, error },
      'Provedor de geocodificação retornou erro recuperável. Alternando para o próximo provedor...',
    )
  }

  /** Every provider was asked and none answered. */
  private decideExhausted(tally: ChainTally): Result<IGeoCoordinates | null, AppError> {
    if (tally.notFoundCount === this.providers.length) {
      logger.warn(
        { notFoundCount: tally.notFoundCount, totalProviders: this.providers.length },
        'Nenhum provedor retornou resultados - coordenadas não encontradas',
      )
      return err(new CoordinatesNotFoundError())
    }

    collectMetricsProviderChainExhausted?.inc({ layer: 'geocoding' })

    if (tally.lastRetryableError) {
      logger.error(
        { provider: tally.lastProviderName, error: tally.lastRetryableError },
        'Geocodificação falhou com erros de sistema',
      )
      return err(tally.lastRetryableError)
    }

    return err(new ProviderFailureError(new Error('TODOS os provedores falharam')))
  }
}
