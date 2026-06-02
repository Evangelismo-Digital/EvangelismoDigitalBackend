import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { DATABASE_QUERY_FAILURE_ERROR } from 'messages/errors/providers/providers-error-messages'

export class DatabaseQueryError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(
      DATABASE_QUERY_FAILURE_ERROR,
      originalError,
      ErrorType.INTERNAL_SERVER_ERROR,
    )
    this.name = 'DatabaseQueryError'
  }
}
