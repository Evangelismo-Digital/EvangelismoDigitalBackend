import { IAppError } from 'core/contracts/errors/app-error.interface'
import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { ErrorType } from 'core/types/error-type/error-type'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'

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
   * @param detail       – the error descriptor (code + message + optional extras)
   * @param type         – the HTTP-level error type
   * @param failureMode  – optional routing failure mode (RETRYABLE | NOT_FOUND)
   */
  protected constructor(detail: IErrorDetail, type: ErrorType, failureMode?: FailureMode) {
    super(detail.message)

    this.name = this.constructor.name
    this.type = type
    this.failureMode = failureMode

    this.body = {
      code: detail.code,
      message: detail.message,
      ...(detail.issues && { issues: detail.issues }),
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }

    Object.setPrototypeOf(this, new.target.prototype)
  }
}
