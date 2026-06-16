import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { USER_NOT_FOUND_ERROR } from 'messages/errors/use-cases/users/users-error-messages'

export class UserNotFoundError extends DomainError {
  constructor() {
    super(USER_NOT_FOUND_ERROR, ErrorType.NOT_FOUND)
  }
}
