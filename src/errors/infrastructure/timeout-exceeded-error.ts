import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'
import { TIMEOUT_EXCEEDED_ERROR } from 'messages/errors/providers/providers-error-messages'

export class TimeoutExceededError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(
      TIMEOUT_EXCEEDED_ERROR,
      reason,
      ErrorType.SERVICE_UNAVAILABLE,
    )
    this.name = 'TimeoutExceededError'
  }
}
