import { IAppError } from 'core/contracts/errors/app-error.interface'
import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { TelemetryReason } from 'core/types/telemetry/telemetry-reason.enum'

export abstract class AppError extends Error implements IAppError {
  public type: ErrorType
  public body: IErrorDetail

  /**
   * Machine-readable routing hint used by resilient fallback chains and cache
   * managers.  Subclasses that participate in fallback/caching declare their
   * own failure mode once; callers never need `instanceof` to branch on it.
   */
  public readonly failureMode?: FailureMode

  /**
   * Self-describing observability tag, parallel to `failureMode` but for metric
   * labels. Subclasses declare their own reason once; consumers read it without
   * `instanceof`. See {@link TelemetryReason}.
   */
  public readonly telemetryReason?: TelemetryReason

  /**
   * @param detail         – the error descriptor (code + message + optional extras)
   * @param type           – the HTTP-level error type
   * @param failureMode    – optional routing failure mode (RETRYABLE | NOT_FOUND)
   * @param telemetryReason – optional observability reason for metric labels
   */
  protected constructor(
    detail: IErrorDetail,
    type: ErrorType,
    failureMode?: FailureMode,
    telemetryReason?: TelemetryReason,
  ) {
    super(detail.message)

    this.name = this.constructor.name
    this.type = type
    this.failureMode = failureMode
    this.telemetryReason = telemetryReason

    this.body = {
      code: detail.code,
      message: detail.message,
      ...(detail.issues && { issues: detail.issues }),
    }

    // No `if` guard: captureStackTrace is a V8 API, this service runs only on
    // Node, and @types/node declares it as always present — the guard was dead
    // on every runtime this code will ever see.
    Error.captureStackTrace(this, this.constructor)

    Object.setPrototypeOf(this, new.target.prototype)
  }
}
