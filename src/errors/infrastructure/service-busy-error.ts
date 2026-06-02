import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'

export class ServiceBusyError extends InfrastructureError {
  constructor(provider: string) {
    super(
      {
        code: 'SERVICE_BUSY',
        message: `${messages.errors.serviceBusy} [Provedor: ${provider}]`,
      },
      undefined,
      ErrorType.TOO_MANY_REQUESTS,
    )
    this.name = 'ServiceBusyError'
  }
}
