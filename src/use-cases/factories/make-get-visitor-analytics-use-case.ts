import { PrismaAnalyticsRepository } from '@repositories/prisma/prisma-analytics-repository'
import { GetVisitorAnalyticsUseCase } from '@use-cases/analytics/get-visitor-analytics'

export function makeGetVisitorAnalyticsUseCase() {
  return new GetVisitorAnalyticsUseCase(new PrismaAnalyticsRepository())
}
