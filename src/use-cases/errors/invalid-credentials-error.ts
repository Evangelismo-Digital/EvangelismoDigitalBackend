import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { INVALID_CREDENTIALS_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export class InvalidCredentialsError extends DomainError {
  constructor() {
    super(INVALID_CREDENTIALS_ERROR, ErrorType.BAD_REQUEST)
  }
}
