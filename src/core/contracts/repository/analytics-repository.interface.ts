import { AnalyticsSession, AnalyticsEvent } from '@prisma/client'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface UpsertSessionInput {
  visitorId: string
  sessionId: string
  ipAddress?: string | null
  userAgent?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
}

export interface CreateEventInput {
  sessionId: string
  eventType: string
  path: string
  payload?: any
}

export interface AnalyticsRepository {
  upsertSession(data: UpsertSessionInput): Promise<Result<AnalyticsSession, AppError>>
  createEvent(data: CreateEventInput): Promise<Result<AnalyticsEvent, AppError>>
  findSessionBySessionId(sessionId: string): Promise<Result<AnalyticsSession | null, AppError>>
}
