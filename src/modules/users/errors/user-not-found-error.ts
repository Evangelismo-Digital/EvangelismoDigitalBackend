import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { USER_ERRORS } from '@common/messages/errors/users'

export class UserNotFoundError extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_FOUND, ErrorType.NOT_FOUND)
  }
}
