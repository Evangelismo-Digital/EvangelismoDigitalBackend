import {
  AnalyticsRepository,
  CreateEventInput,
  UpsertSessionInput,
  UpsertVisitorInput,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface TrackAnalyticsRequest {
  visitorId: string
  sessionId: string
  eventType: string
  path: string
  title?: string | null
  referrer?: string | null
  durationMs?: number | null
  scrollDepth?: number | null
  userId?: string | null
  /** Already truncated to /24 or /48 by the caller — see truncateIp. */
  ipAddress?: string | null
  browser?: string | null
  os?: string | null
  device?: string | null
  language?: string | null
  utmSource?: string | null
  utmMedium?: string | null
  utmCampaign?: string | null
  utmTerm?: string | null
  utmContent?: string | null
  payload?: unknown
}

/**
 * The three write payloads, derived from one request.
 *
 * Split out as pure functions rather than inlined: `execute` is then a
 * three-step sequence readable at a glance, and each mapping can be asserted on
 * directly instead of only through a repository double.
 */
function toVisitorInput(request: TrackAnalyticsRequest): UpsertVisitorInput {
  return {
    visitorId: request.visitorId,
    userId: request.userId,
    firstUtmSource: request.utmSource,
    firstUtmMedium: request.utmMedium,
    firstUtmCampaign: request.utmCampaign,
    firstLandingPath: request.path,
  }
}

function toSessionInput(request: TrackAnalyticsRequest): UpsertSessionInput {
  return {
    sessionId: request.sessionId,
    visitorId: request.visitorId,
    userId: request.userId,
    ipAddress: request.ipAddress,
    browser: request.browser,
    os: request.os,
    device: request.device,
    language: request.language,
    referrer: request.referrer,
    landingPath: request.path,
    utmSource: request.utmSource,
    utmMedium: request.utmMedium,
    utmCampaign: request.utmCampaign,
    utmTerm: request.utmTerm,
    utmContent: request.utmContent,
  }
}

function toEventInput(request: TrackAnalyticsRequest): CreateEventInput {
  return {
    sessionId: request.sessionId,
    eventType: request.eventType,
    path: request.path,
    title: request.title,
    referrer: request.referrer,
    durationMs: request.durationMs,
    scrollDepth: request.scrollDepth,
    payload: request.payload,
  }
}

export class TrackAnalyticsUseCase {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async execute(request: TrackAnalyticsRequest): Promise<Result<void, AppError>> {
    // The visitor must exist before the session: `analytics_sessions` carries a
    // foreign key to `visitor_id`, so the reverse order is a constraint
    // violation rather than a row that merely lacks a join partner.
    const visitorResult = await this.analyticsRepository.upsertVisitor(toVisitorInput(request))

    if (isErr(visitorResult)) {
      return visitorResult
    }

    const sessionResult = await this.analyticsRepository.upsertSession(toSessionInput(request))

    if (isErr(sessionResult)) {
      return sessionResult
    }

    const eventResult = await this.analyticsRepository.createEvent(toEventInput(request))

    if (isErr(eventResult)) {
      return eventResult
    }

    return ok(undefined)
  }
}
