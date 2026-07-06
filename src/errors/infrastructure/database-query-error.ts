import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

export class DatabaseQueryError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(INFRA_ERRORS.DATABASE_QUERY_FAILURE, originalError, ErrorType.INTERNAL_SERVER_ERROR)
    this.name = 'DatabaseQueryError'
  }
}
