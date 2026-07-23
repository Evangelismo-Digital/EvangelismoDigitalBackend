import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'
import { AppError } from 'errors/app-error'

export const userPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new UserAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new UserNotFoundError(), // Record not found (delete/update)
}
