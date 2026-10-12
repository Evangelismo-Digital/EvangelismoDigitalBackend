import { AnalyticsRepository } from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface IdentifyVisitorRequest {
  visitorId: string
  sessionId: string | null
  /**
   * Always from the verified JWT — never from the request body.
   *
   * Accepting it from the body would let any caller attribute a stranger's
   * browsing to themselves, or their own to a stranger. The controller reads it
   * from the AsyncLocalStorage the JWT populated; this type exists to make the
   * provenance explicit at the boundary.
   */
  userId: string
  backfillEarlierSessions: boolean
}

/**
 * Links an anonymous visitor to an authenticated user (§3.7).
 *
 * A visit starts anonymous and may authenticate partway through; the frontend
 * calls this right after a successful login to join the two halves.
 */
export class IdentifyVisitorUseCase {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async execute(request: IdentifyVisitorRequest): Promise<Result<void, AppError>> {
    const visitorResult = await this.analyticsRepository.upsertVisitor({
      visitorId: request.visitorId,
      userId: request.userId,
    })

    if (isErr(visitorResult)) {
      return visitorResult
    }

    const linkResult = await this.analyticsRepository.linkSessionsToUser({
      visitorId: request.visitorId,
      sessionId: request.sessionId,
      userId: request.userId,
      backfillEarlierSessions: request.backfillEarlierSessions,
    })

    if (isErr(linkResult)) {
      return linkResult
    }

    return ok(undefined)
  }
}
