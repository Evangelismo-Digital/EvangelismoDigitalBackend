import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
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
      FailureMode.RETRYABLE,
    )
    this.name = 'ServiceBusyError'
  }
}
