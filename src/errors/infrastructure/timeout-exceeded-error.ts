import { ErrorType } from 'core/types/error-type/error-type'
import { ErrorCategory } from 'core/types/error-category/error-category.enum'
import { InfrastructureError } from '../infrastructure-error'
import { TIMEOUT_EXCEEDED_ERROR } from 'messages/errors/providers/providers-error-messages'

export class TimeoutExceededError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(TIMEOUT_EXCEEDED_ERROR, reason, ErrorType.SERVICE_UNAVAILABLE, ErrorCategory.RETRYABLE)
    this.name = 'TimeoutExceededError'
  }
}

