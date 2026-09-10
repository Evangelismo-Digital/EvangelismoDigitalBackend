import type { FastifyReply, FastifyRequest } from 'fastify'
import { AnalyticsPresenter } from '@http/presenters/analytics-presenter'
import { HTTP_STATUS } from '@http/http-status'
import { visitorsByUserQuerySchema } from '@schemas/analytics/visitor-analytics-schema'
import { makeGetVisitorAnalyticsUseCase } from '@use-cases/factories/make-get-visitor-analytics-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'

/**
 * The secondary lookup: which browsers an account has been seen on.
 *
 * Secondary because this platform's readers are anonymous, so most visitors have
 * no user at all. It exists to get from an account to a `visitorId`, which is
 * the key the profile endpoint actually takes.
 */
export async function listVisitorsByUser(request: FastifyRequest, reply: FastifyReply) {
  const { userId, limit } = visitorsByUserQuerySchema.parse(request.query)

  const result = await makeGetVisitorAnalyticsUseCase().byUser(userId, limit)

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.OK).send({
    visitors: result.value.map((visitor) => AnalyticsPresenter.visitorToHTTP(visitor)),
  })
}
