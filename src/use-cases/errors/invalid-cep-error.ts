import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'
import { DomainError } from 'errors/domain-error'
import { INVALID_CEP_ERROR_FN } from 'messages/errors/churches'

export class InvalidCepError extends DomainError {
  constructor(cep?: string) {
    super(INVALID_CEP_ERROR_FN(cep), ErrorType.NOT_FOUND, FailureMode.NOT_FOUND, TelemetryReason.NOT_FOUND)
  }
}
