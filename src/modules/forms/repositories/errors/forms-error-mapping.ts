import { FormsAlreadyExistsError } from '@modules/forms/errors/forms-already-exists-error'
import { FormsSubmissionError } from '@modules/forms/errors/forms-submission-error'
import { FormsNotFoundError } from '@modules/forms/errors/forms-not-found-error'
import { PrismaErrorMappingConfig } from '@infra/database/prisma/utils/prisma-error-mapper'
import { AppError } from '@common/errors/app-error'

export const formsPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new FormsAlreadyExistsError(),
  P2025: () => new FormsNotFoundError(),
  P2003: () => new FormsSubmissionError(),
}
