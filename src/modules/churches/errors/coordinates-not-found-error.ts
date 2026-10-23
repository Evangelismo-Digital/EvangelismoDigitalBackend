import { ErrorType } from '@common/types/error-type/error-type'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from '@common/types/telemetry/telemetry-reason.enum'
import { DomainError } from '@common/errors/domain-error'
import { CHURCH_ERRORS } from '@common/messages/errors/churches'

export class CoordinatesNotFoundError extends DomainError {
  constructor() {
    super(CHURCH_ERRORS.COORDINATES_NOT_FOUND, ErrorType.NOT_FOUND, FailureMode.NOT_FOUND, TelemetryReason.NOT_FOUND)
  }
}
