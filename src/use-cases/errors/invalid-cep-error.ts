import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { INVALID_CEP_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class InvalidCepError extends DomainError {
  constructor() {
    super(INVALID_CEP_ERROR, ErrorType.NOT_FOUND)
  }
}
