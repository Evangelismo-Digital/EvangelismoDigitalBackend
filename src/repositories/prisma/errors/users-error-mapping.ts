import { AppError, UserAlreadyExistsError, UserNotFoundError } from 'errors'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'

export const userPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new UserAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new UserNotFoundError(), // Record not found (delete/update)
}
