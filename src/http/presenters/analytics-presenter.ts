import {
  IAnalyticsEvent,
  IAnalyticsSession,
  IAnalyticsVisitor,
} from 'core/contracts/repository/analytics-repository.interface'

type HTTPVisitor = {
  visitorId: string
  firstSeenAt: Date
  lastSeenAt: Date
  sessionCount: number
  firstUtmSource: string | null
  firstUtmCampaign: string | null
  firstLandingPath: string | null
  userId: string | null
}

type HTTPPageRead = {
  path: string
  title: string | null
  durationMs: number | null
  scrollDepth: number | null
  occurredAt: Date
}

type HTTPVisit = {
  sessionId: string
  startedAt: Date
  lastSeenAt: Date
  durationMs: number | null
  landingPath: string | null
  exitPath: string | null
  pageViewCount: number
  isBounce: boolean
  browser: string | null
  os: string | null
  device: string | null
  utmSource: string | null
  utmCampaign: string | null
  /** Start of the PREVIOUS visit, so "interval between visits" needs no client maths. */
  previousVisitAt: Date | null
}

/**
 * Shapes analytics rows for the dashboard, and decides what never leaves the
 * database.
 *
 * `ipAddress` is deliberately absent, truncated though it is. It exists for
 * city-level geolocation, not for display, and §5.2's minimisation would be
 * undone by handing it to an operator's browser — the presenter is where that
 * decision is enforced rather than left to each controller to remember.
 *
 * `userAgent` is not here either, because it is no longer stored at all.
 */
export class AnalyticsPresenter {
  static visitorToHTTP(visitor: IAnalyticsVisitor): HTTPVisitor {
    return {
      visitorId: visitor.visitorId,
      firstSeenAt: visitor.firstSeenAt,
      lastSeenAt: visitor.lastSeenAt,
      sessionCount: visitor.sessionCount,
      firstUtmSource: visitor.firstUtmSource,
      firstUtmCampaign: visitor.firstUtmCampaign,
      firstLandingPath: visitor.firstLandingPath,
      userId: visitor.userId,
    }
  }

  static pagesReadToHTTP(events: IAnalyticsEvent[]): HTTPPageRead[] {
    return events.map((event) => ({
      path: event.path,
      title: event.title,
      durationMs: event.durationMs,
      scrollDepth: event.scrollDepth,
      occurredAt: event.occurredAt,
    }))
  }

  /**
   * Visits, each carrying the start of the one before it.
   *
   * Computed here because the rows arrive newest-first and the previous visit is
   * simply the next element — the window function the specification's SQL used
   * is unnecessary once the ordering is known, and doing it here keeps every
   * client from reimplementing it.
   */
  static visitsToHTTP(sessions: IAnalyticsSession[]): HTTPVisit[] {
    return sessions.map((session, index) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      lastSeenAt: session.lastSeenAt,
      durationMs: session.durationMs,
      landingPath: session.landingPath,
      exitPath: session.exitPath,
      pageViewCount: session.pageViewCount,
      isBounce: session.isBounce,
      browser: session.browser,
      os: session.os,
      device: session.device,
      utmSource: session.utmSource,
      utmCampaign: session.utmCampaign,
      previousVisitAt: sessions[index + 1]?.startedAt ?? null,
    }))
  }
}
