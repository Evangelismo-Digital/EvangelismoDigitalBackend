import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { AnalyticsPresenter } from '@modules/analytics/presenters/analytics.presenter'
import { HTTP_STATUS } from '@common/constants/http-status'
import { VALIDATION_LIMITS } from '@common/constants/validation-limits'
import { visitorAnalyticsParamsSchema, visitorAnalyticsQuerySchema } from '@modules/analytics/dto/visitor-analytics.dto'
import { makeGetVisitorAnalyticsUseCase } from '@modules/analytics/factories/make-get-visitor-analytics.service'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'

/**
 * One visitor's full analytics profile (§6), ADMIN-only.
 *
 * Answers all three questions the model was reshaped to support: when they first
 * arrived and came back, which pages they actually read, and how their visits
 * are spaced.
 */
export async function getVisitorAnalytics(
  request: ZodRequest<{ params: typeof visitorAnalyticsParamsSchema; querystring: typeof visitorAnalyticsQuerySchema }>,
  reply: FastifyReply,
) {
  const { visitorId } = request.params
  const { limit, cursor } = request.query

  const result = await makeGetVisitorAnalyticsUseCase().execute({
    pagesLimit: limit,
    visitsLimit: VALIDATION_LIMITS.ANALYTICS_READ_VISITS_LIMIT,
    visitorId,
    cursor,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  const { visitor, pagesRead, visits } = result.value

  return reply.code(HTTP_STATUS.OK).send({
    visitor: AnalyticsPresenter.visitorToHTTP(visitor),
    pagesRead: AnalyticsPresenter.pagesReadToHTTP(pagesRead),
    visits: AnalyticsPresenter.visitsToHTTP(visits),
    // Null when this page was not full: there is nothing after it, and returning
    // a cursor anyway would have the client fetch one guaranteed-empty page.
    nextCursor: pagesRead.length === limit ? (pagesRead.at(-1)?.occurredAt ?? null) : null,
  })
}
