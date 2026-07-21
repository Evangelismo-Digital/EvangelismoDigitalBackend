import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { GEO_ERRORS } from 'messages/errors/geolocation'

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
