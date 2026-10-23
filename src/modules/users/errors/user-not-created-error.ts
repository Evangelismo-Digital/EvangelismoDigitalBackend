import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { USER_ERRORS } from '@common/messages/errors/users'

export class UserNotCreatedError extends DomainError {
  constructor() {
    super(USER_ERRORS.NOT_CREATED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
