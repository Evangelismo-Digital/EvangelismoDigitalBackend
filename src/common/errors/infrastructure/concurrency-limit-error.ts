import { ErrorType } from '@common/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from '@common/messages/errors/infrastructure'

export class ConcurrencyLimitError extends InfrastructureError {
  constructor() {
    super(INFRA_ERRORS.SERVICE_OVERLOAD, undefined, ErrorType.TOO_MANY_REQUESTS)
    this.name = 'ConcurrencyLimitError'
  }
}
