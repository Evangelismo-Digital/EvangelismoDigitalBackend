import { ErrorType } from '@common/types/error-type/error-type'
import { SystemError } from '@common/errors/system-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class CreateChurchError extends SystemError {
  constructor() {
    super(CHURCH_ERRORS.CREATE_FAILED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
