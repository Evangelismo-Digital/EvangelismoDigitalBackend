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

/**
 * Mirrors the Prisma repository: the update and the insert write the same
 * fields, so the double lives in one place too. A divergence here would make a
 * unit test agree with a production path that does something else.
 */
const OPTIONAL_SESSION_FIELDS = [
  'ipAddress',
  'userAgent',
  'utmSource',
  'utmMedium',
  'utmCampaign',
  'utmTerm',
  'utmContent',
] as const

function toSessionAttributes(data: UpsertSessionInput) {
  const optional = Object.fromEntries(OPTIONAL_SESSION_FIELDS.map((field) => [field, data[field] ?? null])) as Record<
    (typeof OPTIONAL_SESSION_FIELDS)[number],
    string | null
  >

  return { visitorId: data.visitorId, ...optional }
}
