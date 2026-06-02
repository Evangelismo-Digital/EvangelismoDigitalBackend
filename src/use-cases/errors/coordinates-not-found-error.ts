import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class CoordinatesNotFoundError extends DomainError {
  constructor() {
    super(
      {
        code: 'COORDINATES_NOT_FOUND',
        message: messages.errors.coordinatesNotFound,
      },
      ErrorType.NOT_FOUND,
    )
  }
}
