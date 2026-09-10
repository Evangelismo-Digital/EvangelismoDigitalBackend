import {
  AnalyticsRepository,
  UpsertSessionInput,
  UpsertVisitorInput,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface StartAnalyticsSessionRequest {
  visitorId: string
  sessionId: string
  /** True when the caller presented no valid visitor cookie. */
  isNewVisitor: boolean
  /** True when a fresh session id was minted rather than an existing one reused. */
  isNewSession: boolean
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

/**
 * The two write payloads, derived from one request — same reasoning as in
 * `track-analytics.ts`: `execute` stays a readable sequence, and each mapping
 * can be asserted directly rather than only through a repository double.
 */
function toVisitorInput(request: StartAnalyticsSessionRequest): UpsertVisitorInput {
  return {
    visitorId: request.visitorId,
    userId: request.userId,
    // A created visitor already counts as one session; only a RETURNING visitor
    // starting a new session increments, or the first visit is counted twice.
    countNewSession: request.isNewSession && !request.isNewVisitor,
    // First-touch attribution is written on create and never updated, so passing
    // it on every call is safe and spares the caller from knowing that.
    firstUtmSource: request.utmSource,
    firstUtmMedium: request.utmMedium,
    firstUtmCampaign: request.utmCampaign,
    firstLandingPath: request.landingPath,
  }
}

function toSessionInput(request: StartAnalyticsSessionRequest): UpsertSessionInput {
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
    landingPath: request.landingPath,
    utmSource: request.utmSource,
    utmMedium: request.utmMedium,
    utmCampaign: request.utmCampaign,
    utmTerm: request.utmTerm,
    utmContent: request.utmContent,
  }
}

/**
 * The one operation allowed to create analytics identity (§3.2).
 *
 * Everything else in this subsystem reads identity and discards the request when
 * it is absent. Concentrating creation here is what makes the visitor count
 * meaningful: a client that does not keep cookies gets a 204 from `/events` and
 * writes no row, instead of minting a fresh visitor on every request.
 */
export class StartAnalyticsSessionUseCase {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async execute(request: StartAnalyticsSessionRequest): Promise<Result<void, AppError>> {
    const visitorResult = await this.analyticsRepository.upsertVisitor(toVisitorInput(request))

    if (isErr(visitorResult)) {
      return visitorResult
    }

    const sessionResult = await this.analyticsRepository.upsertSession(toSessionInput(request))

    if (isErr(sessionResult)) {
      return sessionResult
    }

    return ok(undefined)
  }
}
