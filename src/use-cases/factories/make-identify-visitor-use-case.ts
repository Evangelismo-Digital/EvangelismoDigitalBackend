import { PrismaAnalyticsRepository } from '@repositories/prisma/prisma-analytics-repository'
import { IdentifyVisitorUseCase } from '@use-cases/analytics/identify-visitor'

export function makeIdentifyVisitorUseCase() {
  return new IdentifyVisitorUseCase(new PrismaAnalyticsRepository())
}
