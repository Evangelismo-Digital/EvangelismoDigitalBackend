import { prisma } from '@lib/prisma'
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
      const session = await prisma.analyticsSession.upsert({
        where: { sessionId: data.sessionId },
        update: {
          visitorId: data.visitorId,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmTerm: data.utmTerm ?? null,
          utmContent: data.utmContent ?? null,
        },
        create: {
          visitorId: data.visitorId,
          sessionId: data.sessionId,
          ipAddress: data.ipAddress ?? null,
          userAgent: data.userAgent ?? null,
          utmSource: data.utmSource ?? null,
          utmMedium: data.utmMedium ?? null,
          utmCampaign: data.utmCampaign ?? null,
          utmTerm: data.utmTerm ?? null,
          utmContent: data.utmContent ?? null,
        },
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
          payload: data.payload ?? null,
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
