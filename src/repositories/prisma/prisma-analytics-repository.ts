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
import { toSessionAttributes } from 'core/projections/analytics-session-attributes'

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
