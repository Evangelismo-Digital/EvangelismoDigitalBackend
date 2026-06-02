import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'

export class ServiceOverloadError extends InfrastructureError {
  constructor() {
    super(
      {
        code: 'SERVICE_OVERLOAD',
        message: messages.errors.serviceOverloadError,
      },
      undefined,
      ErrorType.TOO_MANY_REQUESTS,
    )
    this.name = 'ServiceOverloadError'
  }
}
