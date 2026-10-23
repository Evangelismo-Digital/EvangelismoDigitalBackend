import { VALIDATION_ERRORS } from '@common/messages/errors/validation'
import { AppError } from '@common/errors/app-error'
import { ErrorType } from '@common/types/error-type/error-type'

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
