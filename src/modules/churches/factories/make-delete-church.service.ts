import { PrismaChurchesRepository } from '@modules/churches/repositories/prisma-churches.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { churchesPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-prisma-error-mapping'
import { DeleteChurchUseCase } from '@modules/churches/services/delete-church.service'

export function makeDeleteChurchUseCase() {
  const churchesErrorMapper = new PrismaErrorMapper(churchesPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(churchesErrorMapper)
  return new DeleteChurchUseCase(churchesRepository)
}
