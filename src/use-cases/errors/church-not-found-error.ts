import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_NOT_FOUND_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class ChurchNotFoundError extends DomainError {
  constructor() {
    super(CHURCH_NOT_FOUND_ERROR, ErrorType.NOT_FOUND)
  }
}
