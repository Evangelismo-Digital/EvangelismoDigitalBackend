import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

export class ServiceBusyError extends InfrastructureError {
  constructor(provider: string) {
    super(
      {
        code: INFRA_ERRORS.SERVICE_BUSY.code,
        message: `${INFRA_ERRORS.SERVICE_BUSY.message} [Provedor: ${provider}]`,
      },
      undefined,
      ErrorType.TOO_MANY_REQUESTS,
      FailureMode.RETRYABLE,
    )
    this.name = 'ServiceBusyError'
  }
}
