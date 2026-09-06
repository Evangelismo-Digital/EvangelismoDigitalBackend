import { logger } from '@lib/logger'
import { NoAddressProviderError } from './error/no-address-provider-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
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
 * ResilientAddressProvider chains multiple `IAddressProvider` implementations
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

function nameOf(provider: IAddressProvider): string {
  return (provider as { providerName?: string }).providerName ?? provider.constructor.name
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
    const tally: ChainTally = { notFoundCount: 0 }

    for (const [index, provider] of this.providers.entries()) {
      // Honour the budget before each provider attempt: with none left, every
      // remaining provider would fail instantly while still costing quota.
      if (deadline.expired) {
        return err(deadline.asError())
      }

      const providerName = nameOf(provider)
      const result = await this.callProvider(provider, cleanCep, deadline, providerName)
      const terminal = this.interpret(result, providerName, index, cleanCep, tally)

      if (terminal) {
        return terminal
      }
    }

    return this.decideExhausted(cleanCep, tally)
  }

  private async callProvider(
    provider: IAddressProvider,
    cleanCep: string,
    deadline: Deadline,
    providerName: string,
  ): Promise<Result<IAddressData | null, AppError>> {
    const endTimer = collectMetricsProviderLatency?.startTimer({ provider: providerName, layer: 'address' })
    const result = await provider.fetchAddress(cleanCep, deadline)
    endTimer?.()

    recordProviderRequest('address', providerName, result)

    return result
  }

  /**
   * Turns one provider's outcome into either a terminal result for the whole
   * chain, or `null` meaning "keep going" — recording what we learned in `tally`.
   */
  private interpret(
    result: Result<IAddressData | null, AppError>,
    providerName: string,
    index: number,
    cleanCep: string,
    tally: ChainTally,
  ): Result<IAddressData | null, AppError> | null {
    if (isOk(result)) {
      return this.interpretSuccess(result.value, providerName, tally)
    }

    const error = result.error

    // NOT_FOUND: resource genuinely missing — treat same as null response
    if (error.failureMode === FailureMode.NOT_FOUND) {
      tally.notFoundCount++
      logger.info(
        { provider: providerName, cep: cleanCep },
        'Provedor confirmou que o recurso não existe - tentando próximo',
      )
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
    value: IAddressData | null,
    providerName: string,
    tally: ChainTally,
  ): Result<IAddressData | null, AppError> | null {
    if (value) {
      logger.info({ provider: providerName }, 'Endereço obtido com sucesso por um provedor de endereço')
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
        layer: 'address',
        from_provider: providerName,
        to_provider: nameOf(nextProvider),
      })
    }

    logger.warn(
      { provider: providerName, error, attempt: index + 1 },
      'Provedor de endereço retornou erro recuperável. Alternando para o próximo provedor...',
    )
  }

  /** Every provider was asked and none answered. */
  private decideExhausted(cleanCep: string, tally: ChainTally): Result<IAddressData | null, AppError> {
    if (tally.notFoundCount === this.providers.length) {
      // Every provider confirmed the resource does not exist
      logger.warn(
        { cep: cleanCep, notFoundCount: tally.notFoundCount, totalProviders: this.providers.length },
        'TODOS os provedores confirmaram CEP inválido/não encontrado',
      )
      return err(new InvalidCepError())
    }

    collectMetricsProviderChainExhausted?.inc({ layer: 'address' })

    if (tally.lastRetryableError) {
      logger.error(
        {
          cep: cleanCep,
          provider: tally.lastProviderName,
          notFoundCount: tally.notFoundCount,
          error: tally.lastRetryableError,
        },
        'Provedores de endereço falharam com erros de sistema',
      )
      return err(tally.lastRetryableError)
    }

    return err(new ProviderFailureError(new Error('TODOS os provedores falharam')))
  }
}
