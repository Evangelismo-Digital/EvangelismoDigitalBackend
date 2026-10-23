// Abstract class for future domain errors implementations.

import { IErrorDetail } from '@common/interfaces/error-detail.interface'
import { FailureMode } from '@common/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from '@common/types/telemetry/telemetry-reason.enum'
import { AppError } from './app-error'
import { ErrorType } from '@common/types/error-type/error-type'

export abstract class DomainError extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor(detail: IErrorDetail, type: ErrorType, failureMode?: FailureMode, telemetryReason?: TelemetryReason) {
    super(detail, type, failureMode, telemetryReason)
  }
}
