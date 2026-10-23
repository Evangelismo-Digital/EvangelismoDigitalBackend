import { ErrorType } from '@common/types/error-type/error-type'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from '@common/types/telemetry/telemetry-reason.enum'
import { InfrastructureError } from '../infrastructure-error'
import { INFRA_ERRORS } from '@common/messages/errors/infrastructure'

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
