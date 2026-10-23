import { UserAlreadyExistsError } from '@modules/users/errors/user-already-exists-error'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { PrismaErrorMappingConfig } from '@infra/database/prisma/utils/prisma-error-mapper'
import { AppError } from '@common/errors/app-error'

export const userPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new UserAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new UserNotFoundError(), // Record not found (delete/update)
}
