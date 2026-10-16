import { AppError, FormsAlreadyExistsError, FormsNotFoundError, FormsSubmissionError } from 'errors'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'

export const formsPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new FormsAlreadyExistsError(),
  P2025: () => new FormsNotFoundError(),
  P2003: () => new FormsSubmissionError(),
}
