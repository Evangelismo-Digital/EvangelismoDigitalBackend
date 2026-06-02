import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { EMPTY_CHURCH_LIST_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class EmptyChurchListError extends DomainError {
  constructor() {
    super(EMPTY_CHURCH_LIST_ERROR, ErrorType.BAD_REQUEST)
  }
}
