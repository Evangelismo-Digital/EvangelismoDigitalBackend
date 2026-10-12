import { PrismaAnalyticsRepository } from '@repositories/prisma/prisma-analytics-repository'
import { EraseAnalyticsDataUseCase } from '@use-cases/analytics/erase-analytics-data'

export function makeEraseAnalyticsDataUseCase() {
  return new EraseAnalyticsDataUseCase(new PrismaAnalyticsRepository())
}
