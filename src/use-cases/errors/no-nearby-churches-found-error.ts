import { ErrorType } from 'core/types/error-type/error-type'
import { DomainError } from 'errors/domain-error'
import { CHURCH_ERRORS } from 'messages/errors/churches'

export class NoNearbyChurchesFoundError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_NEARBY_FOUND, ErrorType.NOT_FOUND)
  }
}
