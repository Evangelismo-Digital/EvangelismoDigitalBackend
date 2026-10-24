import { AppError } from '@common/errors/app-error'
import { AxiosError, isAxiosError } from 'axios'
import { Prisma } from '@prisma/client'
import { ProviderRateLimitError } from '@common/errors/infrastructure/provider-rate-limit-error'
import { TimeoutExceededError } from '@common/errors/infrastructure/timeout-exceeded-error'
import { ProviderFailureError } from '@common/errors/infrastructure/provider-failure-error'
import { DatabaseQueryError } from '@common/errors/infrastructure/database-query-error'
import { InvalidCepError } from '@modules/churches/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@modules/churches/errors/coordinates-not-found-error'
import { CircuitOpenError } from '@common/errors/infrastructure/circuit-open-error'
import { ConcurrencyLimitError } from '@common/errors/infrastructure/concurrency-limit-error'
import { BrokenCircuitError, BulkheadRejectedError } from 'cockatiel'
import { UPSTREAM_STATUS } from '@common/constants/upstream-http-status'

/** URL fragment -> human-readable provider name, most specific first. */
const PROVIDER_BY_URL_FRAGMENT: ReadonlyArray<readonly [string, string]> = [
  ['viacep', 'ViaCEP'],
  ['awesomeapi', 'AwesomeAPI'],
  ['brasilapi', 'BrasilAPI'],
  ['nominatim', 'Nominatim'],
  ['locationiq', 'LocationIQ'],
  ['stadia', 'Stadia Maps'],
  ['openrouteservice', 'OpenRouteService'],
]

/** Providers that resolve a CEP, so a 404 from them means the CEP is invalid. */
const ADDRESS_URL_FRAGMENTS = ['viacep', 'awesomeapi', 'brasilapi']

// Typed to admit `undefined` so an axios error without a code is simply not a
// member, instead of being looked up under a placeholder string.
const TIMEOUT_CODES = new Set<string | undefined>(['ERR_CANCELED', 'ECONNABORTED'])

export class ProviderErrorMapper {
  private static readonly PROVIDER_UNKNOWN = 'Unknown Provider'

  static map(error: unknown): AppError {
    if (error instanceof AppError) {
      return error
    }

    if (ProviderErrorMapper.isAxiosError(error)) {
      return ProviderErrorMapper.mapAxiosError(error as AxiosError)
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError ||
      error instanceof Prisma.PrismaClientUnknownRequestError
    ) {
      return new DatabaseQueryError(error)
    }

    return ProviderErrorMapper.mapUnrecognized(error)
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
      return new CircuitOpenError(ProviderErrorMapper.PROVIDER_UNKNOWN, error)
    }

    if (error instanceof BulkheadRejectedError) {
      return new ConcurrencyLimitError()
    }

    return new ProviderFailureError(error)
  }

  private static mapAxiosError(error: AxiosError): AppError {
    const status = error.response?.status

    if (status === UPSTREAM_STATUS.TOO_MANY_REQUESTS) {
      return new ProviderRateLimitError(ProviderErrorMapper.detectProvider(error))
    }

    if (ProviderErrorMapper.isTimeout(error)) {
      return new TimeoutExceededError(error.message)
    }

    if (status === UPSTREAM_STATUS.NOT_FOUND) {
      return ProviderErrorMapper.mapNotFound(error)
    }

    return new ProviderFailureError(error)
  }

  /**
   * A 404 from an address provider means the CEP itself does not exist; from a
   * geocoder it means the address could not be placed on the map.
   */
  private static mapNotFound(error: AxiosError): AppError {
    const url = error.config?.url

    if (url && ADDRESS_URL_FRAGMENTS.some((fragment) => url.includes(fragment))) {
      return new InvalidCepError(ProviderErrorMapper.extractCep(url))
    }

    return new CoordinatesNotFoundError()
  }

  private static isAxiosError(error: unknown): boolean {
    return isAxiosError(error)
  }

  private static isTimeout(error: AxiosError): boolean {
    return TIMEOUT_CODES.has(error.code) || error.message.toLowerCase().includes('timeout')
  }

  private static detectProvider(error: AxiosError): string {
    const url = error.config?.url
    const match = PROVIDER_BY_URL_FRAGMENT.find(([fragment]) => url?.includes(fragment))

    return match ? match[1] : ProviderErrorMapper.PROVIDER_UNKNOWN
  }

  private static extractCep(url: string): string | undefined {
    const match = /\b\d{8}\b/.exec(url) || /\d{8}/.exec(url)
    return match ? match[0] : undefined
  }
}
