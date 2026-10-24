import { ErrorType } from '@common/types/error-type/error-type'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from '@common/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { GEO_ERRORS } from '@common/messages/errors/geolocation'

export class TimeoutExceededError extends InfrastructureError {
  constructor(reason?: unknown) {
    super(
      GEO_ERRORS.TIMEOUT_EXCEEDED,
      reason,
      ErrorType.SERVICE_UNAVAILABLE,
      FailureMode.RETRYABLE,
      TelemetryReason.TIMEOUT,
    )
    this.name = 'TimeoutExceededError'
  }
}
