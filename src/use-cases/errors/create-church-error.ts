import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CREATE_CHURCH_FAILED_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class CreateChurchError extends DomainError {
  constructor() {
    super(CREATE_CHURCH_FAILED_ERROR, ErrorType.INTERNAL_SERVER_ERROR)
  }
}
