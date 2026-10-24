import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  CONSENT_COOKIE,
  SESSION_COOKIE,
  VISITOR_COOKIE,
  consentCookieOptions,
  trackingCookieOptions,
} from '@common/plugins/cookies/options'
import { HTTP_STATUS } from '@common/constants/http-status'
import { getUserId } from '@infra/logger'
import { makeEraseAnalyticsDataUseCase } from '@modules/analytics/factories/make-erase-analytics-data.service'
import { isErr } from '@common/utils/result'
import { HttpErrorMapper } from '@common/filters/http-error-mapper'
import { analyticsResponseHeaders } from './session-context'

/**
 * The authenticated right to erasure (§5.3).
 *
 * Scoped to the caller's own `userId` from the verified JWT, which is what makes
 * it safe to expose: there is no parameter by which one account could erase
 * another's record.
 *
 * This is the full-erasure path. Deleting a user ACCOUNT only anonymises the
 * analytics rows (the FK is ON DELETE SET NULL), so aggregate history survives a
 * churned account; this endpoint is the deliberate act that removes the rows.
 */
export async function eraseMyData(_request: FastifyRequest, reply: FastifyReply) {
  analyticsResponseHeaders(reply)

  const userId = getUserId()

  // Unreachable behind `verifyJwt`; present because the use-case needs a real
  // id and an assertion would be a worse way to say so.
  if (!userId) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send()
  }

  const result = await makeEraseAnalyticsDataUseCase().byUser(userId)

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  // The browser holding these cookies just had its record erased; leaving them
  // set would have the next page view re-create a visitor under the same id.
  reply.clearCookie(VISITOR_COOKIE, trackingCookieOptions)
  reply.clearCookie(SESSION_COOKIE, trackingCookieOptions)
  reply.clearCookie(CONSENT_COOKIE, consentCookieOptions)

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
