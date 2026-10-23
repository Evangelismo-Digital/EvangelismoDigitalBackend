import { ErrorType } from '@common/types/error-type/error-type'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { DomainError } from '@common/errors/domain-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class NoNearbyChurchesFoundError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.NO_NEARBY_FOUND, ErrorType.NOT_FOUND, FailureMode.PERMANENT)
  }
}
