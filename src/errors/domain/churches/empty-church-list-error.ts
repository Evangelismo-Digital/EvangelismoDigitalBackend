import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class EmptyChurchListError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.EMPTY_LIST, ErrorType.NOT_FOUND, FailureMode.PERMANENT)
  }
}
