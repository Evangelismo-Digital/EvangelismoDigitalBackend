import { AppError, ChurchAlreadyExistsError, ChurchNotFoundError } from 'errors'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'

export const churchPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new ChurchAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new ChurchNotFoundError(), // Record not found (delete/update)
}
