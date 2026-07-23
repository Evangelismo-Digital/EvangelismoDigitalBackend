import { ChurchAlreadyExistsError } from '@use-cases/errors/church-already-exists-error'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { PrismaErrorMappingConfig } from '@lib/prisma/utils/prisma-error-mapper'
import { AppError } from 'errors/app-error'

export const churchPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new ChurchAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new ChurchNotFoundError(), // Record not found (delete/update)
}
