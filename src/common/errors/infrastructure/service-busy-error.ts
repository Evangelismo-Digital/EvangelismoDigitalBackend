import { ErrorType } from '@common/types/error-type/error-type'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from '@common/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from '@common/messages/errors/infrastructure'

export class ServiceBusyError extends InfrastructureError {
  public readonly provider: string

  constructor(provider: string) {
    super(
      INFRA_ERRORS.SERVICE_BUSY,
      undefined,
      ErrorType.TOO_MANY_REQUESTS,
      FailureMode.RETRYABLE,
      TelemetryReason.RATE_LIMITED,
    )
    this.name = 'ServiceBusyError'
    this.provider = provider
  }
}
