import { randomUUID } from 'node:crypto'
import {
  AnalyticsRepository,
  CreateEventInput,
  IAnalyticsEvent,
  IAnalyticsSession,
  UpsertSessionInput,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  public sessions: IAnalyticsSession[] = []
  public events: IAnalyticsEvent[] = []

  async upsertSession(data: UpsertSessionInput): Promise<Result<IAnalyticsSession, AppError>> {
    let session = this.sessions.find((s) => s.sessionId === data.sessionId)

    if (session) {
      session.visitorId = data.visitorId
      session.ipAddress = data.ipAddress ?? null
      session.userAgent = data.userAgent ?? null
      session.utmSource = data.utmSource ?? null
      session.utmMedium = data.utmMedium ?? null
      session.utmCampaign = data.utmCampaign ?? null
      session.utmTerm = data.utmTerm ?? null
      session.utmContent = data.utmContent ?? null
    } else {
      session = {
        id: randomUUID(),
        visitorId: data.visitorId,
        sessionId: data.sessionId,
        ipAddress: data.ipAddress ?? null,
        userAgent: data.userAgent ?? null,
        utmSource: data.utmSource ?? null,
        utmMedium: data.utmMedium ?? null,
        utmCampaign: data.utmCampaign ?? null,
        utmTerm: data.utmTerm ?? null,
        utmContent: data.utmContent ?? null,
        createdAt: new Date(),
      }
      this.sessions.push(session)
    }

    return ok(session)
  }

  async createEvent(data: CreateEventInput): Promise<Result<IAnalyticsEvent, AppError>> {
    const event: IAnalyticsEvent = {
      id: randomUUID(),
      sessionId: data.sessionId,
      eventType: data.eventType,
      path: data.path,
      payload: data.payload ?? null,
      occurredAt: new Date(),
    }

    this.events.push(event)

    return ok(event)
  }

  async findSessionBySessionId(sessionId: string): Promise<Result<IAnalyticsSession | null, AppError>> {
    const session = this.sessions.find((s) => s.sessionId === sessionId) || null
    return ok(session)
  }
}
