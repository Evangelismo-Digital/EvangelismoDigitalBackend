import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { SERVICE_OVERLOAD_ERROR } from 'messages/errors/providers/providers-error-messages'

export class ServiceOverloadError extends InfrastructureError {
  constructor() {
    super(
      SERVICE_OVERLOAD_ERROR,
      undefined,
      ErrorType.TOO_MANY_REQUESTS,
    )
    this.name = 'ServiceOverloadError'
  }
}
