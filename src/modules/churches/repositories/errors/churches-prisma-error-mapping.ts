import { ChurchAlreadyExistsError } from '@modules/churches/errors/church-already-exists-error'
import { ChurchNotFoundError } from '@modules/churches/errors/church-not-found-error'
import { PrismaErrorMappingConfig } from '@infra/database/prisma/utils/prisma-error-mapper'
import { AppError } from '@common/errors/app-error'

export const churchesPrismaErrorMapping: PrismaErrorMappingConfig<AppError> = {
  P2002: () => new ChurchAlreadyExistsError(), // Unique constraint violation (create)
  P2025: () => new ChurchNotFoundError(), // Record not found (delete/update)
}
