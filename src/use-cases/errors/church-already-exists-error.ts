import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ALREADY_EXISTS_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class ChurchAlreadyExistsError extends DomainError {
  constructor() {
    super(CHURCH_ALREADY_EXISTS_ERROR, ErrorType.CONFLICT)
  }
}
