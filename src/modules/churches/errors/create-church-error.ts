import { ErrorType } from '@common/types/error-type/error-type'
import { DomainError } from '@common/errors/domain-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class CreateChurchError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.CREATE_FAILED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
