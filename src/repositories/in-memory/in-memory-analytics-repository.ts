import { randomUUID } from 'node:crypto'
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
import { Result, ok } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import {
  toEventAttributes,
  toSessionAttributes,
  toVisitorCreateAttributes,
} from 'core/projections/analytics-session-attributes'

export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  public visitors: IAnalyticsVisitor[] = []
  public sessions: IAnalyticsSession[] = []
  public events: IAnalyticsEvent[] = []

  async upsertVisitor(data: UpsertVisitorInput): Promise<Result<IAnalyticsVisitor, AppError>> {
    const existing = this.visitors.find((v) => v.visitorId === data.visitorId)

    if (existing) {
      // Mirrors the Prisma `update`: only the link and the clock move. Rewriting
      // first-touch attribution here would let a unit test pass against
      // behaviour production does not have.
      existing.userId = data.userId ?? existing.userId
      existing.lastSeenAt = new Date()

      if (data.countNewSession) {
        existing.sessionCount += 1
      }

      return ok(existing)
    }

    const created: IAnalyticsVisitor = {
      id: randomUUID(),
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      sessionCount: 1,
      ...toVisitorCreateAttributes(data),
    }

    this.visitors.push(created)

    return ok(created)
  }

  async upsertSession(data: UpsertSessionInput): Promise<Result<IAnalyticsSession, AppError>> {
    const attributes = toSessionAttributes(data)
    const existing = this.sessions.find((s) => s.sessionId === data.sessionId)

    if (existing) {
      Object.assign(existing, attributes, { lastSeenAt: new Date() })

      return ok(existing)
    }

    const created: IAnalyticsSession = {
      id: randomUUID(),
      sessionId: data.sessionId,
      startedAt: new Date(),
      lastSeenAt: new Date(),
      endedAt: null,
      durationMs: null,
      country: null,
      region: null,
      city: null,
      exitPath: null,
      pageViewCount: 0,
      eventCount: 0,
      isBounce: true,
      ...attributes,
    }

    this.sessions.push(created)

    return ok(created)
  }

  async createEvent(data: CreateEventInput): Promise<Result<IAnalyticsEvent, AppError>> {
    const event: IAnalyticsEvent = {
      id: randomUUID(),
      sessionId: data.sessionId,
      eventType: data.eventType,
      path: data.path,
      ...toEventAttributes(data),
      payload: data.payload ?? null,
      occurredAt: new Date(),
    }

    this.events.push(event)

    return ok(event)
  }

  async findSessionBySessionId(sessionId: string): Promise<Result<IAnalyticsSession | null, AppError>> {
    return ok(this.sessions.find((s) => s.sessionId === sessionId) ?? null)
  }

  async findVisitorByVisitorId(visitorId: string): Promise<Result<IAnalyticsVisitor | null, AppError>> {
    return ok(this.visitors.find((v) => v.visitorId === visitorId) ?? null)
  }

  async linkSessionsToUser(data: LinkSessionsToUserInput): Promise<Result<number, AppError>> {
    const claimed = this.sessions.filter((session) => this.shouldClaim(session, data))

    for (const session of claimed) {
      session.userId = data.userId
    }

    return ok(claimed.length)
  }

  async deleteVisitorData(visitorId: string): Promise<Result<number, AppError>> {
    return ok(this.eraseVisitors((visitor) => visitor.visitorId === visitorId))
  }

  async deleteDataForUser(userId: string): Promise<Result<number, AppError>> {
    return ok(this.eraseVisitors((visitor) => visitor.userId === userId))
  }

  async purgeEventsOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>> {
    const doomedIds = new Set(
      this.events
        .filter((event) => event.occurredAt < cutoff)
        .slice(0, batchSize)
        .map((event) => event.id),
    )

    this.events = this.events.filter((event) => !doomedIds.has(event.id))

    return ok(doomedIds.size)
  }

  async purgeSessionsOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>> {
    const doomed = this.sessions.filter((session) => session.startedAt < cutoff).slice(0, batchSize)

    this.removeSessions(doomed)

    return ok(doomed.length)
  }

  async purgeVisitorsInactiveSince(cutoff: Date, batchSize: number): Promise<Result<number, AppError>> {
    const doomedIds = new Set(
      this.visitors
        .filter((visitor) => visitor.lastSeenAt < cutoff)
        .slice(0, batchSize)
        .map((visitor) => visitor.visitorId),
    )

    return ok(this.eraseVisitors((visitor) => doomedIds.has(visitor.visitorId)))
  }

  async findPagesRead(query: PagesReadQuery): Promise<Result<IAnalyticsEvent[], AppError>> {
    const sessionIds = new Set(
      this.sessions.filter((session) => session.visitorId === query.visitorId).map((session) => session.sessionId),
    )

    const pages = this.events
      .filter((event) => sessionIds.has(event.sessionId) && event.durationMs !== null)
      .filter((event) => query.cursor === null || event.occurredAt < query.cursor)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, query.limit)

    return ok(pages)
  }

  async findVisits(visitorId: string, limit: number): Promise<Result<IAnalyticsSession[], AppError>> {
    const visits = this.sessions
      .filter((session) => session.visitorId === visitorId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, limit)

    return ok(visits)
  }

  async findVisitorsByUserId(userId: string, limit: number): Promise<Result<IAnalyticsVisitor[], AppError>> {
    const visitors = this.visitors
      .filter((visitor) => visitor.userId === userId)
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, limit)

    return ok(visitors)
  }

  /**
   * Deletes visitors AND everything hanging off them.
   *
   * The database gets this for free from ON DELETE CASCADE. Here it has to be
   * written out, and it has to be written out correctly: a double that deleted
   * only the visitor row would leave orphaned sessions no query returns, and a
   * deletion test asserting "the visitor is gone" would pass while production
   * and the double disagreed about what erasure means.
   */
  private eraseVisitors(matches: (visitor: IAnalyticsVisitor) => boolean): number {
    // Sets keyed by id, not `Array.includes` on the objects: identity comparison
    // over two arrays is quadratic, and these run over every retained row on a
    // nightly sweep.
    const doomedIds = new Set(this.visitors.filter(matches).map((visitor) => visitor.visitorId))

    this.removeSessions(this.sessions.filter((session) => doomedIds.has(session.visitorId)))
    this.visitors = this.visitors.filter((visitor) => !doomedIds.has(visitor.visitorId))

    return doomedIds.size
  }

  private removeSessions(doomed: IAnalyticsSession[]): void {
    const doomedIds = new Set(doomed.map((session) => session.sessionId))

    this.events = this.events.filter((event) => !doomedIds.has(event.sessionId))
    this.sessions = this.sessions.filter((session) => !doomedIds.has(session.sessionId))
  }

  /**
   * Mirrors `sessionsToClaim` in the Prisma repository. The `userId === null`
   * condition on the backfill path is the important half: without it, a second
   * account signing in on a shared browser would take over the first account's
   * sessions.
   */
  private shouldClaim(session: IAnalyticsSession, data: LinkSessionsToUserInput): boolean {
    if (data.backfillEarlierSessions) {
      return session.visitorId === data.visitorId && session.userId === null
    }

    // No explicit null guard: a stored `sessionId` is always a string, so
    // comparing it against a null target already matches nothing. The guard that
    // used to be here was an equivalent mutant — it could not change any result.
    // The Prisma side DOES need its own guard, because there an absent filter
    // widens the query rather than narrowing it; the asymmetry is deliberate.
    return session.sessionId === data.sessionId
  }
}
