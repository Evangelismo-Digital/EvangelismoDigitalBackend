import { PrismaAnalyticsRepository } from '@modules/analytics/repositories/prisma-analytics.repository'
import { IdentifyVisitorUseCase } from '@modules/analytics/services/identify-visitor.service'

export function makeIdentifyVisitorUseCase() {
  return new IdentifyVisitorUseCase(new PrismaAnalyticsRepository())
}
