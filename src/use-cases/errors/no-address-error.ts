import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { NO_ADDRESS_PROVIDED_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class NoAddressError extends DomainError {
  constructor() {
    super(NO_ADDRESS_PROVIDED_ERROR, ErrorType.BAD_REQUEST)
  }
}
