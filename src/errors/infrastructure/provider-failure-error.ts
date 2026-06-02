import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'

export class ProviderFailureError extends InfrastructureError {
  constructor(provider: string, originalError?: unknown) {
    super(
      {
        code: 'PROVIDER_FAILURE',
        message: `${messages.errors.providerFailure} [Provedor: ${provider}]`,
      },
      originalError,
      ErrorType.SERVICE_UNAVAILABLE,
    )
    this.name = 'ProviderFailureError'
  }
}
