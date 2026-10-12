import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

/**
 * A browser, tracked across visits for up to 13 months.
 *
 * `firstSeenAt` / `lastSeenAt` / `sessionCount` are stored rather than derived:
 * "when did they first arrive and when did they come back" was previously only
 * answerable by aggregating sessions, which is both slow and wrong once
 * retention starts deleting the earliest ones.
 */
export interface IAnalyticsVisitor {
  id: string
  visitorId: string
  firstSeenAt: Date
  lastSeenAt: Date
  sessionCount: number
  firstUtmSource: string | null
  firstUtmMedium: string | null
  firstUtmCampaign: string | null
  firstLandingPath: string | null
  userId: string | null
}

/** One visit. Ends after 30 minutes of inactivity, not when the tab closes. */
export interface IAnalyticsSession {
  id: string
  sessionId: string
  visitorId: string
  userId: string | null
  startedAt: Date
  lastSeenAt: Date
  endedAt: Date | null
  durationMs: number | null
  /** Truncated to /24 or /48 before it ever reaches here — see truncateIp. */
  ipAddress: string | null
  country: string | null
  region: string | null
  city: string | null
  /** Parsed from the user-agent; the raw string is deliberately not stored. */
  browser: string | null
  os: string | null
  device: string | null
  language: string | null
  referrer: string | null
  landingPath: string | null
  exitPath: string | null
  pageViewCount: number
  eventCount: number
  isBounce: boolean
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmTerm: string | null
  utmContent: string | null
}

export interface IAnalyticsEvent {
  id: string
  sessionId: string
  eventType: string
  path: string
  title: string | null
  referrer: string | null
  durationMs: number | null
  scrollDepth: number | null
  payload: unknown
  occurredAt: Date
}

export interface UpsertVisitorInput {
  visitorId: string
  userId?: string | null
  /**
   * Increments `sessionCount` on an EXISTING visitor.
   *
   * Only `/session` sets this, and only when it actually mints a new session id.
   * A created visitor starts at 1 — their first session — so incrementing on
   * create as well would count it twice.
   */
  countNewSession?: boolean
  /**
   * First-touch attribution. Written only when the visitor row is created — a
   * later campaign must not overwrite the one that actually acquired them.
   */
  firstUtmSource?: string | null
  firstUtmMedium?: string | null
  firstUtmCampaign?: string | null
  firstLandingPath?: string | null
}

export interface UpsertSessionInput {
  sessionId: string
  visitorId: string
  userId?: string | null
  ipAddress?: string | null
  browser?: string | null
  os?: string | null
  device?: string | null
  language?: string | null
  referrer?: string | null
  landingPath?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
}

export interface CreateEventInput {
  sessionId: string
  eventType: string
  path: string
  title?: string | null
  referrer?: string | null
  durationMs?: number | null
  scrollDepth?: number | null
  payload?: unknown
}

export interface LinkSessionsToUserInput {
  visitorId: string
  /** The visit in progress. Null when the caller presented no session cookie. */
  sessionId: string | null
  userId: string
  /**
   * Whether to also claim this visitor's EARLIER anonymous sessions.
   *
   * A privacy decision, not a technical one, which is why it is a parameter
   * rather than a constant: it retroactively attaches browsing that happened
   * before the person identified themselves.
   */
  backfillEarlierSessions: boolean
}

export interface AnalyticsRepository {
  /**
   * Creates the visitor or refreshes `lastSeenAt`. Must be called before
   * `upsertSession`: sessions carry a foreign key to `visitor_id`, so a session
   * written without its visitor is a constraint violation, not a missing join.
   */
  upsertVisitor(data: UpsertVisitorInput): Promise<Result<IAnalyticsVisitor, AppError>>
  upsertSession(data: UpsertSessionInput): Promise<Result<IAnalyticsSession, AppError>>
  createEvent(data: CreateEventInput): Promise<Result<IAnalyticsEvent, AppError>>
  findSessionBySessionId(sessionId: string): Promise<Result<IAnalyticsSession | null, AppError>>
  findVisitorByVisitorId(visitorId: string): Promise<Result<IAnalyticsVisitor | null, AppError>>
  /** Attaches sessions to a user. Returns how many rows were claimed. */
  linkSessionsToUser(data: LinkSessionsToUserInput): Promise<Result<number, AppError>>

  /**
   * Erases one browser's entire analytics record. Returns how many visitors were
   * removed — 0 when there was nothing to erase, which is a success, not a
   * failure: a revocation from a visitor who was never tracked must not error.
   *
   * Sessions and events go with it through the foreign keys' ON DELETE CASCADE,
   * so this is the whole record and not just its root.
   */
  deleteVisitorData(visitorId: string): Promise<Result<number, AppError>>

  /**
   * Erases every browser this user was ever linked to (LGPD right to erasure).
   *
   * Distinct from a user account deletion, which only anonymises: the FK is
   * ON DELETE SET NULL so aggregates survive a churned account. Erasure is an
   * explicit act by the data subject, and it takes the rows with it.
   */
  deleteDataForUser(userId: string): Promise<Result<number, AppError>>

  /** Deletes events older than the cutoff, in bounded batches. */
  purgeEventsOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>>

  /** Deletes sessions older than the cutoff, in bounded batches. */
  purgeSessionsOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>>

  /** Deletes visitors with no activity since the cutoff, in bounded batches. */
  purgeVisitorsInactiveSince(cutoff: Date, batchSize: number): Promise<Result<number, AppError>>

  /**
   * Pages this visitor actually READ, newest first.
   *
   * Only events carrying a measurement are returned: a `page_view` with no
   * duration records that a URL was requested, which is the metric this design
   * exists to move beyond. Cursor-paginated because a retained visitor can hold
   * fourteen months of rows and an unbounded response is a latent outage.
   */
  findPagesRead(query: PagesReadQuery): Promise<Result<IAnalyticsEvent[], AppError>>

  /** This visitor's visits, newest first, for computing intervals between them. */
  findVisits(visitorId: string, limit: number): Promise<Result<IAnalyticsSession[], AppError>>

  /** Every visitor linked to a user — the secondary lookup for the read API. */
  findVisitorsByUserId(userId: string, limit: number): Promise<Result<IAnalyticsVisitor[], AppError>>
}

export interface PagesReadQuery {
  visitorId: string
  limit: number
  /** `occurredAt` of the last row of the previous page; null starts from newest. */
  cursor: Date | null
}
