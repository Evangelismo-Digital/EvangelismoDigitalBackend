import { PrismaChurchesRepository } from '@repositories/prisma/prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@repositories/prisma/errors/churches-error-mapping'
import { DeleteChurchUseCase } from '@use-cases/churches/delete-church-use-case'

export function makeDeleteChurchUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  const deleteChurchUseCase = new DeleteChurchUseCase(churchesRepository)

  return deleteChurchUseCase
}
