import { PrismaAnalyticsRepository } from '@modules/analytics/repositories/prisma-analytics.repository'
import { GetVisitorAnalyticsUseCase } from '@modules/analytics/services/get-visitor-analytics.service'

export function makeGetVisitorAnalyticsUseCase() {
  return new GetVisitorAnalyticsUseCase(new PrismaAnalyticsRepository())
}
