import { FormAlreadyExistsError } from '@modules/forms/errors/form-already-exists-error'
import { FormSubmissionError } from '@modules/forms/errors/form-submission-error'
import { FormNotFoundError } from '@modules/forms/errors/form-not-found-error'
import { PrismaErrorMappingConfig } from '@infra/database/prisma/utils/prisma-error-mapper'
import { AppError } from '@common/errors/app-error'

export const formsPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new FormAlreadyExistsError(),
  P2025: () => new FormNotFoundError(),
  P2003: () => new FormSubmissionError(),
}
