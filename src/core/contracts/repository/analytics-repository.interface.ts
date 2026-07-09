import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface IAnalyticsSession {
  id: string
  visitorId: string
  sessionId: string
  ipAddress: string | null
  userAgent: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
  createdAt: Date
}

export interface IAnalyticsEvent {
  id: string
  sessionId: string
  eventType: string
  path: string
  payload: any
  occurredAt: Date
}

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
  upsertSession(data: UpsertSessionInput): Promise<Result<IAnalyticsSession, AppError>>
  createEvent(data: CreateEventInput): Promise<Result<IAnalyticsEvent, AppError>>
  findSessionBySessionId(sessionId: string): Promise<Result<IAnalyticsSession | null, AppError>>
}
