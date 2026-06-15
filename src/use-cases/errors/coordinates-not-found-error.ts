import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { DomainError } from 'errors/domain-error'
import { COORDINATES_NOT_FOUND_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class CoordinatesNotFoundError extends DomainError {
  constructor() {
    super(COORDINATES_NOT_FOUND_ERROR, ErrorType.NOT_FOUND, FailureMode.NOT_FOUND)
  }
}
