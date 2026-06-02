import { messages } from 'core/constants/messages'
import { ErrorType } from 'core/types/error-type/error-type'
import { InfrastructureError } from '../infrastructure-error'

export class TimeoutExceededError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(
      {
        code: 'TIMEOUT_EXCEEDED',
        message: messages.errors.timeoutExceededOnFetch,
      },
      reason,
      ErrorType.SERVICE_UNAVAILABLE,
    )
    this.name = 'TimeoutExceededError'
  }
}
