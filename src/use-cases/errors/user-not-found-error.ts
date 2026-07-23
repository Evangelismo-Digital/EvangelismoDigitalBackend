import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { USER_ERRORS } from 'messages/errors/users'

export class UserNotFoundError extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_FOUND, ErrorType.NOT_FOUND)
  }
}
