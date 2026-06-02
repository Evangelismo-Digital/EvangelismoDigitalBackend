import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { PROVIDER_FAILURE_ERROR } from 'messages/errors/providers/providers-error-messages'

export class ProviderFailureError extends InfrastructureError {
  constructor(provider: string, originalError?: unknown) {
    super(
      {
        code: PROVIDER_FAILURE_ERROR.code,
        message: `${PROVIDER_FAILURE_ERROR.message} [Provedor: ${provider}]`,
      },
      originalError,
      ErrorType.SERVICE_UNAVAILABLE,
    )
    this.name = 'ProviderFailureError'
  }
}
