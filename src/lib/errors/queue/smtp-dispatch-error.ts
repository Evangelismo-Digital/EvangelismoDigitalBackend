import { QUEUE_ERRORS } from 'messages/errors/queue'
import { InfrastructureError } from '../../../errors/infrastructure-error'

export class SmtpDispatchError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(QUEUE_ERRORS.SMTP_DISPATCH_FAILED, originalError)
  }
}
