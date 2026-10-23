import { PrismaAnalyticsRepository } from '@modules/analytics/repositories/prisma-analytics.repository'
import { StartAnalyticsSessionUseCase } from '@modules/analytics/services/start-analytics-session.service'

export function makeStartAnalyticsSessionUseCase() {
  return new StartAnalyticsSessionUseCase(new PrismaAnalyticsRepository())
}
