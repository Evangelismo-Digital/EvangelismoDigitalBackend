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
import { toSessionAttributes } from 'core/projections/analytics-session-attributes'

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  public sessions: IAnalyticsSession[] = []
  public events: IAnalyticsEvent[] = []

  async upsertSession(data: UpsertSessionInput): Promise<Result<IAnalyticsSession, AppError>> {
    let session = this.sessions.find((s) => s.sessionId === data.sessionId)

    const attributes = toSessionAttributes(data)

    if (session) {
      Object.assign(session, attributes)
    } else {
      session = {
        id: randomUUID(),
        sessionId: data.sessionId,
        ...attributes,
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
