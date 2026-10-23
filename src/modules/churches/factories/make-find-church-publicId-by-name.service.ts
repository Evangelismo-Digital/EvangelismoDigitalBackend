import { PrismaChurchesRepository } from '@modules/churches/repositories/prisma-churches.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-error-mapping'
import { FindChurchPublicIdByNameUseCase } from '@modules/churches/services/find-church-publicId-by-name.service'

export function makeFindChurchPublicIdByNameUseCase() {
  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  return new FindChurchPublicIdByNameUseCase(churchesRepository)
}
