import { logger } from '@lib/logger'
import { NoGeoProviderError } from './error/no-geo-provider-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  IGeoSearchOptions,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { Result, ok, err, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import {
  providerLatency,
  providerFallback,
  providerChainExhausted,
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
export class ResilientGeoProvider implements IGeocodingProvider {
  constructor(private readonly providers: IGeocodingProvider[]) {
    if (this.providers.length === 0) {
      throw new NoGeoProviderError()
    }
  }

  async search(query: string, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>> {
    const effectiveSignal = signal ?? new AbortController().signal
    return await this.executeStrategy((provider, innerSignal) => provider.search(query, innerSignal), effectiveSignal)
  }

  async searchStructured(
    options: IGeoSearchOptions,
    signal?: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    const effectiveSignal = signal ?? new AbortController().signal
    return await this.executeStrategy(
      (provider, innerSignal) => provider.searchStructured(options, innerSignal),
      effectiveSignal,
    )
  }

  private async executeStrategy(
    action: (provider: IGeocodingProvider, signal: AbortSignal) => Promise<Result<IGeoCoordinates | null, AppError>>,
    signal: AbortSignal,
  ): Promise<Result<IGeoCoordinates | null, AppError>> {
    let lastRetryableError: AppError | undefined = undefined

    let lastProviderName = ''

    let notFoundCount = 0

    for (const [index, provider] of this.providers.entries()) {
      const providerName = (provider as { providerName?: string }).providerName ?? provider.constructor.name

      // Defensive Check — honour abort before each provider attempt
      if (signal.aborted) {
        return err(new TimeoutExceededError(signal.reason))
      }

      const endTimer = providerLatency?.startTimer({ provider: providerName, layer: 'geocoding' })
      const result = await action(provider, signal)
      endTimer?.()

      recordProviderRequest('geocoding', providerName, result)

      if (isOk(result)) {
        if (result.value !== null) {
          logger.info({ provider: providerName }, 'Geocodificação obtida com sucesso por um provedor de geocodificação')
          return ok(result.value)
        }
        // Provider returned null (not found)
        notFoundCount++
        logger.info({ provider: providerName }, 'Provedor retornou null (não encontrado) - tentando próximo')
        continue
      }

      const error = result.error

      // NOT_FOUND: resource genuinely missing — treat same as null response
      if (error.failureMode === FailureMode.NOT_FOUND) {
        notFoundCount++
        logger.info({ provider: providerName }, 'Coordenadas não encontradas - tentando próximo')
        continue
      }

      // RETRYABLE: transient infra error — log and advance to next provider
      if (error.failureMode === FailureMode.RETRYABLE) {
        lastRetryableError = error
        lastProviderName = providerName

        const nextProvider = this.providers[index + 1]
        if (nextProvider) {
          const nextProviderName =
            (nextProvider as { providerName?: string }).providerName ?? nextProvider.constructor.name
          providerFallback?.inc({ layer: 'geocoding', from_provider: providerName, to_provider: nextProviderName })
        }

        logger.warn(
          { provider: providerName, attempt: index + 1, error },
          'Provedor de geocodificação retornou erro recuperável. Alternando para o próximo provedor...',
        )
        continue
      }

      // Unknown / fatal error — bail immediately without trying other providers
      logger.error({ provider: providerName, error }, 'Provedor retornou erro fatal. Abortando cadeia.')
      return err(error)
    }

    // Decision phase: all providers exhausted
    if (notFoundCount === this.providers.length) {
      logger.warn(
        { notFoundCount, totalProviders: this.providers.length },
        'Nenhum provedor retornou resultados - coordenadas não encontradas',
      )
      return err(new CoordinatesNotFoundError())
    }

    if (lastRetryableError) {
      providerChainExhausted?.inc({ layer: 'geocoding' })
      logger.error(
        { provider: lastProviderName, error: lastRetryableError },
        'Geocodificação falhou com erros de sistema',
      )
      return err(lastRetryableError)
    }

    providerChainExhausted?.inc({ layer: 'geocoding' })
    return err(
      new ProviderFailureError('ResilientGeoProvider', ProviderLayer.Geo, new Error('TODOS os provedores falharam')),
    )
  }
}
