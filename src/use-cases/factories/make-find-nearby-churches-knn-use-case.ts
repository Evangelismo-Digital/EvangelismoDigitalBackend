import { PrismaChurchesRepository } from '@repositories/prisma/prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from '@repositories/prisma/errors/churches-error-mapping'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'

let cachedUseCase: FindNearbyChurchesKnnUseCase | null = null

export function makeFindNearbyChurchesKnnUseCase() {
  if (cachedUseCase) {
    return cachedUseCase
  }

  const errorMapper = new PrismaErrorMapper(churchPrismaErrorMapping)
  const churchesRepository = new PrismaChurchesRepository(errorMapper)
  cachedUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)

  return cachedUseCase
}
