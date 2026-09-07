import { PrismaChurchesRepository } from '@repositories/prisma/prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@repositories/prisma/errors/churches-error-mapping'
import { FindChurchPublicIdByNameUseCase } from '@use-cases/churches/find-church-publicId-by-name-use-case'

export function makeFindChurchPublicIdByNameUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  return new FindChurchPublicIdByNameUseCase(churchesRepository)
}
