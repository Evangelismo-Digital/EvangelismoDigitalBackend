import {
  AnalyticsRepository,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface TrackAnalyticsRequest {
  visitorId: string
  sessionId: string
  eventType: string
  path: string
  ipAddress?: string | null
  userAgent?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  payload?: any
}

export class TrackAnalyticsUseCase {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async execute(request: TrackAnalyticsRequest): Promise<Result<void, AppError>> {
    // 1. Ensure the session exists in the database
    const sessionResult = await this.analyticsRepository.upsertSession({
      visitorId: request.visitorId,
      sessionId: request.sessionId,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      utmSource: request.utmSource,
      utmMedium: request.utmMedium,
      utmCampaign: request.utmCampaign,
      utmTerm: request.utmTerm,
      utmContent: request.utmContent,
    })

    if (isErr(sessionResult)) {
      return sessionResult
    }

    // 2. Create the analytics event
    const eventResult = await this.analyticsRepository.createEvent({
      sessionId: request.sessionId,
      eventType: request.eventType,
      path: request.path,
      payload: request.payload,
    })

    if (isErr(eventResult)) {
      return eventResult
    }

    return ok(undefined)
  }
}
