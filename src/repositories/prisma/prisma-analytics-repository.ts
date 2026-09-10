import { prisma } from '@lib/prisma'
import { Prisma } from '@prisma/client'
import {
  AnalyticsRepository,
  CreateEventInput,
  IAnalyticsEvent,
  IAnalyticsSession,
  IAnalyticsVisitor,
  LinkSessionsToUserInput,
  PagesReadQuery,
  UpsertSessionInput,
  UpsertVisitorInput,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import {
  toEventAttributes,
  toSessionAttributes,
  toVisitorCreateAttributes,
} from 'core/projections/analytics-session-attributes'

export class PrismaAnalyticsRepository implements AnalyticsRepository {
  async upsertVisitor(data: UpsertVisitorInput): Promise<Result<IAnalyticsVisitor, AppError>> {
    try {
      const visitor = await prisma.analyticsVisitor.upsert({
        where: { visitorId: data.visitorId },
        // First-touch attribution is absent from `update` on purpose: it records
        // the campaign that acquired the visitor and must survive later ones.
        // `lastSeenAt` is @updatedAt, so an empty-looking update still moves it.
        //
        // The user link is written ONLY when one is supplied. `userId ?? null`
        // here — the obvious spelling, and what this first did — un-identified
        // the visitor on the next anonymous page view after login, because on a
        // blog almost every request that follows sign-in carries no JWT. That is
        // the opposite of the session rule a few lines down, where absence must
        // clear the value; the two look alike and mean opposite things.
        update: {
          ...(data.userId ? { userId: data.userId } : {}),
          ...(data.countNewSession ? { sessionCount: { increment: 1 } } : {}),
        },
        create: toVisitorCreateAttributes(data),
      })

      return ok(visitor)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

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
          ...toEventAttributes(data),
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
      return ok(await prisma.analyticsSession.findUnique({ where: { sessionId } }))
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async findVisitorByVisitorId(visitorId: string): Promise<Result<IAnalyticsVisitor | null, AppError>> {
    try {
      return ok(await prisma.analyticsVisitor.findUnique({ where: { visitorId } }))
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async linkSessionsToUser(data: LinkSessionsToUserInput): Promise<Result<number, AppError>> {
    try {
      const { count } = await prisma.analyticsSession.updateMany({
        where: sessionsToClaim(data),
        data: { userId: data.userId },
      })

      return ok(count)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async deleteVisitorData(visitorId: string): Promise<Result<number, AppError>> {
    try {
      // Sessions and events follow through ON DELETE CASCADE, so deleting the
      // visitor root erases the whole record in one statement.
      const { count } = await prisma.analyticsVisitor.deleteMany({ where: { visitorId } })

      return ok(count)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async deleteDataForUser(userId: string): Promise<Result<number, AppError>> {
    try {
      const { count } = await prisma.analyticsVisitor.deleteMany({ where: { userId } })

      return ok(count)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async purgeEventsOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>> {
    return this.purgeBatch(
      (ids) => prisma.analyticsEvent.deleteMany({ where: { id: { in: ids } } }),
      () =>
        prisma.analyticsEvent.findMany({
          where: { occurredAt: { lt: cutoff } },
          select: { id: true },
          take: batchSize,
        }),
    )
  }

  async purgeSessionsOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>> {
    return this.purgeBatch(
      (ids) => prisma.analyticsSession.deleteMany({ where: { id: { in: ids } } }),
      () =>
        prisma.analyticsSession.findMany({
          where: { startedAt: { lt: cutoff } },
          select: { id: true },
          take: batchSize,
        }),
    )
  }

  async purgeVisitorsInactiveSince(cutoff: Date, batchSize: number): Promise<Result<number, AppError>> {
    return this.purgeBatch(
      (ids) => prisma.analyticsVisitor.deleteMany({ where: { id: { in: ids } } }),
      () =>
        prisma.analyticsVisitor.findMany({
          where: { lastSeenAt: { lt: cutoff } },
          select: { id: true },
          take: batchSize,
        }),
    )
  }

  async findPagesRead(query: PagesReadQuery): Promise<Result<IAnalyticsEvent[], AppError>> {
    try {
      const events = await prisma.analyticsEvent.findMany({
        where: {
          session: { visitorId: query.visitorId },
          // A reading measurement, not merely a request. `durationMs` is only
          // written by page_exit, so its presence is what separates "read" from
          // "loaded and abandoned".
          durationMs: { not: null },
          ...(query.cursor ? { occurredAt: { lt: query.cursor } } : {}),
        },
        orderBy: { occurredAt: 'desc' },
        take: query.limit,
      })

      return ok(events)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async findVisits(visitorId: string, limit: number): Promise<Result<IAnalyticsSession[], AppError>> {
    try {
      const sessions = await prisma.analyticsSession.findMany({
        where: { visitorId },
        orderBy: { startedAt: 'desc' },
        take: limit,
      })

      return ok(sessions)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  async findVisitorsByUserId(userId: string, limit: number): Promise<Result<IAnalyticsVisitor[], AppError>> {
    try {
      const visitors = await prisma.analyticsVisitor.findMany({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
        take: limit,
      })

      return ok(visitors)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }

  /**
   * Select-then-delete rather than a single `deleteMany` with the date filter.
   *
   * `deleteMany` has no LIMIT in Prisma, so on a table with months of backlog it
   * would take one enormous lock and hold it for the length of the delete. A
   * bounded id list keeps each statement short and the table available; the cron
   * calls back until a pass deletes nothing.
   */
  private async purgeBatch(
    remove: (ids: string[]) => Promise<{ count: number }>,
    find: () => Promise<{ id: string }[]>,
  ): Promise<Result<number, AppError>> {
    try {
      const rows = await find()

      if (rows.length === 0) {
        return ok(0)
      }

      const { count } = await remove(rows.map((row) => row.id))

      return ok(count)
    } catch (error) {
      return err(new DatabaseQueryError(error))
    }
  }
}

/**
 * Which sessions an identify call claims.
 *
 * Backfill widens this from "the visit in progress" to "every unclaimed session
 * this browser has ever had". `userId: null` in the backfill filter is not an
 * optimisation — it stops the sweep from stealing sessions that a DIFFERENT
 * account already claimed on a shared browser.
 */
function sessionsToClaim(data: LinkSessionsToUserInput) {
  if (data.backfillEarlierSessions) {
    return { visitorId: data.visitorId, userId: null }
  }

  // `sessionId: null` would match every session with a null id — of which there
  // are none, since it is the unique key — so an absent session must be turned
  // into a filter that matches nothing rather than one that matches broadly.
  return data.sessionId === null ? { sessionId: '' } : { sessionId: data.sessionId }
}
