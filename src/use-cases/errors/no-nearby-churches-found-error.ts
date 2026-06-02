import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { NO_NEARBY_CHURCHES_FOUND_ERROR } from 'messages/errors/use-cases/churches/churches-error-messages'

export class NoNearbyChurchesFoundError extends DomainError {
  constructor() {
    super(NO_NEARBY_CHURCHES_FOUND_ERROR, ErrorType.NOT_FOUND)
  }
}
