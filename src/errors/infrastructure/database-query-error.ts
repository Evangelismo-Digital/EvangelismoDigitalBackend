import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'

export class DatabaseQueryError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(
      {
        code: 'DATABASE_QUERY_FAILURE',
        message: messages.errors.databaseQueryFailure,
      },
      originalError,
      ErrorType.INTERNAL_SERVER_ERROR,
    )
    this.name = 'DatabaseQueryError'
  }
}
