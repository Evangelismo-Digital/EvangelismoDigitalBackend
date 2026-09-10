import {
  AnalyticsRepository,
  IAnalyticsEvent,
  IAnalyticsSession,
  IAnalyticsVisitor,
} from 'core/contracts/repository/analytics-repository.interface'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { VisitorNotFoundError } from '@use-cases/errors/visitor-not-found-error'

export interface GetVisitorAnalyticsRequest {
  visitorId: string
  pagesLimit: number
  visitsLimit: number
  cursor: Date | null
}

export interface GetVisitorAnalyticsResponse {
  visitor: IAnalyticsVisitor
  pagesRead: IAnalyticsEvent[]
  visits: IAnalyticsSession[]
}

/**
 * Everything the dashboard shows for one visitor, in one read (§6).
 *
 * Keyed by `visitorId` rather than `userId` because this platform's readers are
 * anonymous: a userId-keyed lookup would answer "no data" for almost everyone.
 */
export class GetVisitorAnalyticsUseCase {
  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async execute(request: GetVisitorAnalyticsRequest): Promise<Result<GetVisitorAnalyticsResponse, AppError>> {
    const visitorResult = await this.analyticsRepository.findVisitorByVisitorId(request.visitorId)

    if (isErr(visitorResult)) {
      return visitorResult
    }

    if (visitorResult.value === null) {
      // A 404 rather than empty sections: "this visitor has no reading history"
      // and "this visitor does not exist" are different answers, and a dashboard
      // that cannot tell them apart will show a blank page for a typo.
      return err(new VisitorNotFoundError())
    }

    const pagesResult = await this.analyticsRepository.findPagesRead({
      visitorId: request.visitorId,
      limit: request.pagesLimit,
      cursor: request.cursor,
    })

    if (isErr(pagesResult)) {
      return pagesResult
    }

    const visitsResult = await this.analyticsRepository.findVisits(request.visitorId, request.visitsLimit)

    if (isErr(visitsResult)) {
      return visitsResult
    }

    return ok({ visitor: visitorResult.value, pagesRead: pagesResult.value, visits: visitsResult.value })
  }

  async byUser(userId: string, limit: number): Promise<Result<IAnalyticsVisitor[], AppError>> {
    return this.analyticsRepository.findVisitorsByUserId(userId, limit)
  }
}
