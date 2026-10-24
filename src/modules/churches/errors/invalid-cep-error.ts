import { ErrorType } from '@common/types/error-type/error-type'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from '@common/types/telemetry/telemetry-reason.enum'
import { DomainError } from '@common/errors/domain-error'
import { INVALID_CEP_ERROR_FN } from '@common/messages/errors/churches'

export class InvalidCepError extends DomainError {
  constructor(cep?: string) {
    super(INVALID_CEP_ERROR_FN(cep), ErrorType.NOT_FOUND, FailureMode.NOT_FOUND, TelemetryReason.NOT_FOUND)
  }
}
