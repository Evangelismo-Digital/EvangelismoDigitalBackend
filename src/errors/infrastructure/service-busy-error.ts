import { ErrorType } from 'core/types/error-type/error-type'
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
    )
    this.name = 'ServiceBusyError'
  }
}
