import { PrismaAnalyticsRepository } from '@repositories/prisma/prisma-analytics-repository'
import { StartAnalyticsSessionUseCase } from '@use-cases/analytics/start-analytics-session'

export function makeStartAnalyticsSessionUseCase() {
  return new StartAnalyticsSessionUseCase(new PrismaAnalyticsRepository())
}
