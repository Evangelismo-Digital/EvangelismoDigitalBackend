import { PrismaAnalyticsRepository } from '@modules/analytics/repositories/prisma-analytics.repository'
import { TrackAnalyticsUseCase } from '@modules/analytics/services/track-analytics.service'

export function makeTrackAnalyticsUseCase() {
  const analyticsRepository = new PrismaAnalyticsRepository()
  return new TrackAnalyticsUseCase(analyticsRepository)
}
