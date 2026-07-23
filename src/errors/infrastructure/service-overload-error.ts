import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

export class ServiceOverloadError extends InfrastructureError {
  constructor() {
    super(INFRA_ERRORS.SERVICE_OVERLOAD, undefined, ErrorType.TOO_MANY_REQUESTS)
    this.name = 'ServiceOverloadError'
  }
}
