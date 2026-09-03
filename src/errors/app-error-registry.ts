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
import { ProviderFailureError } from './infrastructure/provider-failure-error'

export interface SerializedErrorData {
  body?: {
    provider?: string
  }
  originalError?: unknown
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
    const provider = data?.body?.provider || msg.replace('Serviço temporariamente indisponível: ', '')
    return new ServiceBusyError(provider)
  },

  ServiceOverloadError: () => new InfraServiceOverloadError(),

  TimeoutExceededError: (msg) => new TimeoutExceededError(msg),

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
