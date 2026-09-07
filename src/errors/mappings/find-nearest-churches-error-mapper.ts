import { Result, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { AxiosError, isAxiosError } from 'axios'
import { Prisma } from '@prisma/client'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError } from 'errors/infrastructure/provider-failure-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { CircuitOpenError } from 'errors/infrastructure/circuit-open-error'
import { ServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { BrokenCircuitError, BulkheadRejectedError } from 'cockatiel'
import { UPSTREAM_STATUS } from 'core/constants/upstream-http-status'

/** URL fragment -> human-readable provider name, most specific first. */
const PROVIDER_BY_URL_FRAGMENT: ReadonlyArray<readonly [string, string]> = [
  ['viacep', 'ViaCEP'],
  ['awesomeapi', 'AwesomeAPI'],
  ['brasilapi', 'BrasilAPI'],
  ['nominatim', 'Nominatim'],
  ['locationiq', 'LocationIQ'],
  ['stadia', 'Stadia Maps'],
]

/** Providers that resolve a CEP, so a 404 from them means the CEP is invalid. */
const ADDRESS_URL_FRAGMENTS = ['viacep', 'awesomeapi', 'brasilapi']

const TIMEOUT_CODES = new Set(['ERR_CANCELED', 'ECONNABORTED'])

export class FindNearestChurchesErrorMapper {
  private static readonly PROVIDER_UNKNOWN = 'Unknown Provider'

  static async runCatching<T>(fn: () => Promise<Result<T, AppError>>): Promise<Result<T, AppError>> {
    try {
      return await fn()
    } catch (error) {
      return err(FindNearestChurchesErrorMapper.map(error))
    }
  }

  static map(error: unknown): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (FindNearestChurchesErrorMapper.isAxiosError(error)) {
      return FindNearestChurchesErrorMapper.mapAxiosError(error as AxiosError)
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return new DatabaseQueryError(error)
    }

    return FindNearestChurchesErrorMapper.mapUnrecognized(error)
  }

  /**
   * Failures raised by a resilience policy itself rather than by the provider.
   *
   * These say the call never happened: a breaker had already tripped, or the
   * concurrency limit was full. Left to the fallback below they would be
   * reported as ProviderFailureError, which would both mislabel them in
   * metrics and hide the fact that no upstream request was ever made.
   */
  private static mapUnrecognized(error: unknown): AppError {
    if (error instanceof BrokenCircuitError) {
      return new CircuitOpenError(FindNearestChurchesErrorMapper.PROVIDER_UNKNOWN, error)
    }

    if (error instanceof BulkheadRejectedError) {
      return new ServiceOverloadError()
    }

    return new ProviderFailureError(error instanceof Error ? error : new Error(String(error)))
  }

  private static mapAxiosError(error: AxiosError): AppError {
    const status = error.response?.status

    if (status === UPSTREAM_STATUS.TOO_MANY_REQUESTS) {
      return new ServiceBusyError(FindNearestChurchesErrorMapper.detectProvider(error))
    }

    if (FindNearestChurchesErrorMapper.isTimeout(error)) {
      return new TimeoutExceededError(error.message)
    }

    if (status === UPSTREAM_STATUS.NOT_FOUND) {
      return FindNearestChurchesErrorMapper.mapNotFound(error)
    }

    return new ProviderFailureError(error)
  }

  /**
   * A 404 from an address provider means the CEP itself does not exist; from a
   * geocoder it means the address could not be placed on the map.
   */
  private static mapNotFound(error: AxiosError): AppError {
    const url = error.config?.url || ''

    if (ADDRESS_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return new InvalidCepError(FindNearestChurchesErrorMapper.extractCep(url))
    }

    return new CoordinatesNotFoundError()
  }

  private static isAxiosError(error: unknown): boolean {
    return isAxiosError(error)
  }

  private static isTimeout(error: AxiosError): boolean {
    return TIMEOUT_CODES.has(error.code ?? '') || error.message.toLowerCase().includes('timeout')
  }

  private static detectProvider(error: AxiosError): string {
    const url = error.config?.url || ''
    const match = PROVIDER_BY_URL_FRAGMENT.find(([fragment]) => url.includes(fragment))

    return match ? match[1] : FindNearestChurchesErrorMapper.PROVIDER_UNKNOWN
  }

  private static extractCep(url: string): string | undefined {
    const match = /\b\d{8}\b/.exec(url) || /\d{8}/.exec(url)
    return match ? match[0] : undefined
  }
}
