import { PrismaChurchesRepository } from '@modules/churches/repositories/prisma-churches.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-error-mapping'
import { CreateChurchUseCase } from '@modules/churches/services/create-church.service'

export function makeCreateChurchUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  return new CreateChurchUseCase(churchesRepository)
}
