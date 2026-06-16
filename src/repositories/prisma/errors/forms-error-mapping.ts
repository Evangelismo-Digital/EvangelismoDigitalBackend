import { FormsAlreadyExistsError } from '@use-cases/errors/forms/forms-already-exists-error'
import { FormsSubmissionError } from '@use-cases/errors/forms/forms-submission-error'
import { FormsNotFoundError } from '@use-cases/errors/forms/forms-not-found-error'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'
import { AppError } from 'errors/app-error'

export const formsPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new FormsAlreadyExistsError(),
  P2025: () => new FormsNotFoundError(),
  P2003: () => new FormsSubmissionError(),
}
