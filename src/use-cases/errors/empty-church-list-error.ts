import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class EmptyChurchListError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.EMPTY_LIST, ErrorType.NOT_FOUND)
  }
}
