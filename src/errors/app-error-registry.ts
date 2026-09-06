import { AppError } from './app-error'
import { InfrastructureError } from './infrastructure-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { EmptyChurchListError } from '@use-cases/errors/empty-church-list-error'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import { ServiceBusyError } from './infrastructure/service-busy-error'
import { ServiceOverloadError as InfraServiceOverloadError } from './infrastructure/service-overload-error'
import { TimeoutExceededError } from './infrastructure/timeout-exceeded-error'
import { DeadlineExceededError } from './infrastructure/deadline-exceeded-error'
import { ProviderFailureError } from './infrastructure/provider-failure-error'
import { CircuitOpenError } from './infrastructure/circuit-open-error'

export interface SerializedErrorData {
  /**
   * Top-level fields, as produced by {@link serializeAppError}, which stores the
   * error instance itself — so a provider name lands here, not under `body`.
   */
  provider?: string
  /** Explicitly structured form, used by callers that build the payload by hand. */
  body?: {
    provider?: string
  }
  originalError?: unknown
}

/** Neutral label for metrics when a round trip carried no provider name. */
const UNKNOWN_PROVIDER = 'Unknown Provider'

function readProvider(data: SerializedErrorData | undefined): string | undefined {
  return data?.provider || data?.body?.provider
}

export const AppErrorRegistry: Record<string, (message: string, data?: SerializedErrorData) => AppError> = {
  InvalidCepError: (msg) => {
    const cep = msg.match(/\b\d{8}\b/)?.[0] || msg.match(/\d{8}/)?.[0]
    return new InvalidCepError(cep)
  },

  CoordinatesNotFoundError: () => new CoordinatesNotFoundError(),

  NoNearbyChurchesFoundError: () => new NoNearbyChurchesFoundError(),

  EmptyChurchListError: () => new EmptyChurchListError(),

  CepToLatLonError: (msg) => {
    const cep = msg.match(/\d+/)?.[0] || ''
    return new CepToLatLonError(cep)
  },

  ServiceBusyError: (msg, data) => {
    const provider = readProvider(data) || msg.replace('Serviço temporariamente indisponível: ', '')
    return new ServiceBusyError(provider)
  },

  ServiceOverloadError: () => new InfraServiceOverloadError(),

  TimeoutExceededError: (msg) => new TimeoutExceededError(msg),

  DeadlineExceededError: (msg) => new DeadlineExceededError(msg),

  CircuitOpenError: (msg, data) => {
    return new CircuitOpenError(readProvider(data) || UNKNOWN_PROVIDER)
  },

  ProviderFailureError: (msg, data) => new ProviderFailureError(data?.originalError),
}

export function serializeAppError(err: AppError): { type: string; message: string; data?: unknown } {
  return {
    type: err.constructor.name,
    message: err.message,
    data: (err as { data?: unknown }).data || err,
  }
}

class UnknownDeserializationError extends InfrastructureError {
  constructor(message: string) {
    super({
      code: 'UNKNOWN_DESERIALIZATION_ERROR',
      message,
    })
  }
}

export function deserializeAppError(type: string, message: string, data?: unknown): AppError {
  const factory = AppErrorRegistry[type]
  if (factory) {
    try {
      return factory(message, data as SerializedErrorData)
    } catch {
      // Fall through to default fallback
    }
  }
  return new UnknownDeserializationError(message)
}
