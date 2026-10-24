import { PrismaAnalyticsRepository } from '@modules/analytics/repositories/prisma-analytics.repository'
import { EraseAnalyticsDataUseCase } from '@modules/analytics/services/erase-analytics-data.service'

export function makeEraseAnalyticsDataUseCase() {
  return new EraseAnalyticsDataUseCase(new PrismaAnalyticsRepository())
}
