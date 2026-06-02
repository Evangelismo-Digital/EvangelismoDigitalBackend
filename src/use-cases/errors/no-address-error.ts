import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class NoAddressError extends DomainError {
  constructor() {
    super(
      {
        code: 'NO_ADDRESS_PROVIDED',
        message: messages.errors.noAddressProvided,
      },
      ErrorType.BAD_REQUEST,
    )
  }
}
