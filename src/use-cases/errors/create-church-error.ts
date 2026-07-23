import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class CreateChurchError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.CREATE_FAILED, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
