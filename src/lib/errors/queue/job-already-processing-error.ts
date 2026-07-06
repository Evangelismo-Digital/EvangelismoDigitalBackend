import { QUEUE_ERRORS } from 'messages/errors/queue'
import { InfrastructureError } from '../../../errors/infrastructure-error'

export class JobAlreadyProcessingError extends InfrastructureError {
  constructor() {
    super(QUEUE_ERRORS.JOB_ALREADY_PROCESSING)
  }
}
