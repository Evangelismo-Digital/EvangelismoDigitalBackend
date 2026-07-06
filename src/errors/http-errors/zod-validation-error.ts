import { VALIDATION_ERRORS } from 'messages/errors/validation'
import { AppError } from '../app-error'
import { ErrorType } from 'core/types/error-type/error-type'

export class ZodValidationError extends AppError {
  constructor(issues: Record<string, unknown>) {
    super(
      {
        code: VALIDATION_ERRORS.ZOD_VALIDATION.code,
        message: VALIDATION_ERRORS.ZOD_VALIDATION.message,
        issues,
      },
      ErrorType.BAD_REQUEST,
    )
  }
}
