import { PrismaChurchesRepository } from '@modules/churches/repositories/prisma-churches.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import { churchesPrismaErrorMapping } from '@modules/churches/repositories/errors/churches-prisma-error-mapping'
import { FindChurchPublicIdByNameUseCase } from '@modules/churches/services/find-church-publicId-by-name.service'

export function makeFindChurchPublicIdByNameUseCase() {
  const churchesErrorMapper = new PrismaErrorMapper(churchesPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(churchesErrorMapper)
  return new FindChurchPublicIdByNameUseCase(churchesRepository)
}
