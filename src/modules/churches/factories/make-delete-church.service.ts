import { PrismaChurchesRepository } from '@modules/churches/repositories/prisma-churches.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-error-mapping'
import { DeleteChurchUseCase } from '@modules/churches/services/delete-church.service'

export function makeDeleteChurchUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  return new DeleteChurchUseCase(churchesRepository)
}
