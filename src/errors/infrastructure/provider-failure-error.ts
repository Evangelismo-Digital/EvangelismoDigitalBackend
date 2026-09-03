import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from 'messages/errors/infrastructure'

export class ProviderFailureError extends InfrastructureError {
  constructor(originalError?: unknown) {
    super(
      {
        code: INFRA_ERRORS.PROVIDER_FAILURE.code,
        message: INFRA_ERRORS.PROVIDER_FAILURE.message,
      },
      originalError,
      ErrorType.SERVICE_UNAVAILABLE,
      FailureMode.RETRYABLE,
      TelemetryReason.PROVIDER_ERROR,
    )
    this.name = 'ProviderFailureError'
  }
}
