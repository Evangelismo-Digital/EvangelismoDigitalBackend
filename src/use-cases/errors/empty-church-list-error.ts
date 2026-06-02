import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class EmptyChurchListError extends DomainError {
  constructor() {
    super(
      {
        code: 'EMPTY_CHURCH_LIST',
        message: messages.errors.emptyChurchList,
      },
      ErrorType.BAD_REQUEST,
    )
  }
}
