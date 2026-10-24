import { PrismaChurchesRepository } from '@modules/churches/repositories/prisma-churches.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { churchesPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-prisma-error-mapping'
import { CreateChurchUseCase } from '@modules/churches/services/create-church.service'

export function makeCreateChurchUseCase() {
  const churchesErrorMapper = new PrismaErrorMapper(churchesPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(churchesErrorMapper)
  return new CreateChurchUseCase(churchesRepository)
}
