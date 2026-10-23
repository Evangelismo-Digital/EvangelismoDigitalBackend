import { ZodRequest } from '@common/types/zod-request'
import type { FastifyReply } from 'fastify'
import { AnalyticsPresenter } from '@modules/analytics/presenters/analytics.presenter'
import { HTTP_STATUS } from '@common/constants/http-status'
import { visitorsByUserQuerySchema } from '@modules/analytics/dto/visitor-analytics.dto'
import { makeGetVisitorAnalyticsUseCase } from '@modules/analytics/factories/make-get-visitor-analytics.service'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'

/**
 * The secondary lookup: which browsers an account has been seen on.
 *
 * Secondary because this platform's readers are anonymous, so most visitors have
 * no user at all. It exists to get from an account to a `visitorId`, which is
 * the key the profile endpoint actually takes.
 */
export async function listVisitorsByUser(
  request: ZodRequest<{ querystring: typeof visitorsByUserQuerySchema }>,
  reply: FastifyReply,
) {
  const { userId, limit } = request.query

  const result = await makeGetVisitorAnalyticsUseCase().byUser(userId, limit)

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.OK).send({
    visitors: result.value.map((visitor) => AnalyticsPresenter.visitorToHTTP(visitor)),
  })
}
