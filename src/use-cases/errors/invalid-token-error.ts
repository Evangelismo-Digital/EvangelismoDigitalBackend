import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { INVALID_TOKEN_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export class InvalidTokenError extends DomainError {
  constructor() {
    super(INVALID_TOKEN_ERROR, ErrorType.UNAUTHORIZED)
  }
}
