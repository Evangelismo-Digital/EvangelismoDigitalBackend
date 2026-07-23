import { PrismaAnalyticsRepository } from '@repositories/prisma/prisma-analytics-repository'
import { TrackAnalyticsUseCase } from '@use-cases/analytics/track-analytics'

export function makeTrackAnalyticsUseCase() {
  const analyticsRepository = new PrismaAnalyticsRepository()
  const trackAnalyticsUseCase = new TrackAnalyticsUseCase(analyticsRepository)
  return trackAnalyticsUseCase
}
