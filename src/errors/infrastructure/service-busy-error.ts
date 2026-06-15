import { ErrorType } from 'core/types/error-type/error-type'
import { ErrorCategory } from 'core/types/error-category/error-category.enum'
import { InfrastructureError } from '../infrastructure-error'
import { SERVICE_BUSY_ERROR } from 'messages/errors/providers/providers-error-messages'

export class ServiceBusyError extends InfrastructureError {
  constructor(provider: string) {
    super(
      {
        code: SERVICE_BUSY_ERROR.code,
        message: `${SERVICE_BUSY_ERROR.message} [Provedor: ${provider}]`,
      },
      undefined,
      ErrorType.TOO_MANY_REQUESTS,
      ErrorCategory.RETRYABLE,
    )
    this.name = 'ServiceBusyError'
  }
}
