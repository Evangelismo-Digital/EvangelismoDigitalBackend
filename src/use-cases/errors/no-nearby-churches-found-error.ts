import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'

export class NoNearbyChurchesFoundError extends DomainError {
  constructor() {
    super(
      {
        code: 'NO_NEARBY_CHURCHES_FOUND',
        message: messages.errors.noNearbyChurchesFound,
      },
      ErrorType.NOT_FOUND,
    )
  }
}
