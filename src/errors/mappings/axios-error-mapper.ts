import { AxiosError } from 'axios'
import { AppError } from 'errors/app-error'
import { ServiceBusyError } from 'errors/infrastructure/service-busy-error'
import { ProviderFailureError, ProviderLayer } from 'errors/infrastructure/provider-failure-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'

/**
 * Maps an Axios HTTP status code to a typed `AppError` for **address** providers
 * (ViaCEP, BrasilAPI, AwesomeAPI).
 *
 * The lookup table pattern mirrors the Prisma error mapping used in
 * `church-error-mapping.ts`, eliminating `if (status === X)` chains.
 */
const ADDRESS_STATUS_MAP: Record<number, (provider: string) => AppError> = {
  404: () => new InvalidCepError(),
  429: (provider) => new ServiceBusyError(provider),
}

/**
 * Maps an Axios HTTP status code to a typed `AppError` for **geocoding** providers
 * (Nominatim, LocationIQ).
 */
const GEO_STATUS_MAP: Record<number, (provider: string) => AppError> = {
  404: () => new CoordinatesNotFoundError(),
  429: (provider) => new ServiceBusyError(provider),
}

/**
 * Checks whether an Axios error represents a retryable condition
 * (network failure, 5xx server error) — no response means the request
 * never reached the server.
 */
function isRetryableStatus(status: number | undefined): boolean {
  return typeof status === 'number' && (status >= 500 || status === 429)
}

function isNetworkError(err: AxiosError): boolean {
  return !err.response
}

export type ProviderErrorContext = {
  provider: string
  originalError: unknown
  layer?: ProviderLayer
}

/**
 * Resolves an `AppError` from a raw Axios error for **address** providers.
 *
 * Returns `null` when the error is transient and the caller should retry.
 * Returns an `AppError` when the error is terminal (don't retry, return it).
 */
export function resolveAddressProviderError(
  err: AxiosError,
  { provider, originalError }: ProviderErrorContext,
): { error: AppError; shouldRetry: boolean } {
  const status = err.response?.status

  const factory = status !== undefined ? ADDRESS_STATUS_MAP[status] : undefined
  if (factory) {
    return { error: factory(provider), shouldRetry: false }
  }

  const retryable = isNetworkError(err) || isRetryableStatus(status)
  return {
    error: new ProviderFailureError(provider, ProviderLayer.Address, originalError),
    shouldRetry: retryable,
  }
}

/**
 * Resolves an `AppError` from a raw Axios error for **geocoding** providers.
 */
export function resolveGeoProviderError(
  err: AxiosError,
  { provider, originalError }: ProviderErrorContext,
): { error: AppError; shouldRetry: boolean } {
  const status = err.response?.status

  const factory = status !== undefined ? GEO_STATUS_MAP[status] : undefined
  if (factory) {
    return { error: factory(provider), shouldRetry: false }
  }

  const retryable = isNetworkError(err) || isRetryableStatus(status)
  return {
    error: new ProviderFailureError(provider, ProviderLayer.Geo, originalError),
    shouldRetry: retryable,
  }
}

/**
 * Resolves an `AppError` from a raw Axios error for **routing** providers
 * (Stadia Maps).  A 404 from a routing API means the route could not be
 * computed (no path), which is represented as a `null` distance rather than
 * an error.  We therefore expose a separate resolver for the routing domain.
 */
export function resolveRoutingProviderError(
  err: AxiosError,
  { provider, originalError }: ProviderErrorContext,
): AppError {
  const status = err.response?.status

  if (status === 429) {
    return new ServiceBusyError(provider)
  }

  if (err.code === 'ERR_CANCELED') {
    return new TimeoutExceededError(err.message)
  }

  return new ProviderFailureError(provider, ProviderLayer.Route, originalError)
}
