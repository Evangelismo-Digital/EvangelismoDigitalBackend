import { ErrorType } from '@common/types/error-type/error-type'
import { SystemError } from '@common/errors/system-error'
import { USER_ERRORS } from '@common/messages/errors/users'

export class UserNotCreatedError extends SystemError {
  constructor() {
    super(USER_ERRORS.NOT_CREATED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
