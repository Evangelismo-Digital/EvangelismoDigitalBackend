import { PrismaChurchesRepository } from '@repositories/prisma/prisma-churches-repository'
import { FindNearbyChurchesKnnUseCase } from '@use-cases/churches/find-nearby-churches-knn-use-case'

let cachedUseCase: FindNearbyChurchesKnnUseCase | null = null

export function makeFindNearbyChurchesKnnUseCase() {
  if (cachedUseCase) {
    return cachedUseCase
  }

  const churchesRepository = new PrismaChurchesRepository()
  cachedUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)

  return cachedUseCase
}
