import { QUEUE_ERRORS } from '@common/messages/errors/queue'
import { InfrastructureError } from '@common/errors/infrastructure-error'

export class JobAlreadyProcessingError extends InfrastructureError {
  constructor() {
    super(QUEUE_ERRORS.JOB_ALREADY_PROCESSING)
  }
}
