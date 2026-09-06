import { prisma } from '@lib/prisma'
import { Prisma } from '@prisma/client'
import {
  AnalyticsRepository,
  CreateEventInput,
  IAnalyticsEvent,
  IAnalyticsSession,
  UpsertSessionInput,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  async upsertSession(data: UpsertSessionInput): Promise<Result<IAnalyticsSession, AppError>> {
    try {
      const attributes = toSessionAttributes(data)

      const session = await prisma.analyticsSession.upsert({
        where: { sessionId: data.sessionId },
        update: attributes,
        create: { ...attributes, sessionId: data.sessionId },
      })
      return ok(session)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async createEvent(data: CreateEventInput): Promise<Result<IAnalyticsEvent, AppError>> {
    try {
      const event = await prisma.analyticsEvent.create({
        data: {
          sessionId: data.sessionId,
          eventType: data.eventType,
          path: data.path,
          payload: (data.payload ?? null) as Prisma.InputJsonValue,
        },
      })
      return ok(event)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async findSessionBySessionId(sessionId: string): Promise<Result<IAnalyticsSession | null, AppError>> {
    try {
      const session = await prisma.analyticsSession.findUnique({
        where: { sessionId },
      })
      return ok(session)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }
}

/**
 * The insert and the update wrote the same eight fields; only `sessionId` is
 * unique to the insert. Listing them once removes the risk of the two halves
 * drifting apart, which would make an upsert store different data depending on
 * whether the row happened to exist.
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
