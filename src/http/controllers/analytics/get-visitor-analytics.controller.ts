import type { FastifyReply, FastifyRequest } from 'fastify'
import { AnalyticsPresenter } from '@http/presenters/analytics-presenter'
import { HTTP_STATUS } from '@http/http-status'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'
import { visitorAnalyticsParamsSchema, visitorAnalyticsQuerySchema } from '@schemas/analytics/visitor-analytics-schema'
import { makeGetVisitorAnalyticsUseCase } from '@use-cases/factories/make-get-visitor-analytics-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

/**
 * One visitor's full analytics profile (§6), ADMIN-only.
 *
 * Answers all three questions the model was reshaped to support: when they first
 * arrived and came back, which pages they actually read, and how their visits
 * are spaced.
 */
export async function getVisitorAnalytics(request: FastifyRequest, reply: FastifyReply) {
  const { visitorId } = visitorAnalyticsParamsSchema.parse(request.params)
  const { limit, cursor } = visitorAnalyticsQuerySchema.parse(request.query)

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
