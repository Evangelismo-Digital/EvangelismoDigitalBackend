import type { FastifyReply, FastifyRequest } from 'fastify'
import {
  CONSENT_COOKIE,
  SESSION_COOKIE,
  VISITOR_COOKIE,
  consentCookieOptions,
  trackingCookieOptions,
} from '@http/cookies/options'
import { HTTP_STATUS } from '@http/http-status'
import { makeEraseAnalyticsDataUseCase } from '@use-cases/factories/make-erase-analytics-data-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { analyticsResponseHeaders } from './session-context'

/**
 * Withdraws consent and erases what was collected under it (§5.1).
 *
 * Deliberately unauthenticated: the caller is an anonymous visitor by
 * definition, and requiring a login to withdraw consent would make withdrawal
 * conditional on handing over more identity than tracking ever asked for.
 *
 * Erasure is part of the operation, not a follow-up. "Stop collecting" leaves
 * thirteen months of history in place; the LGPD right being exercised here is
 * to have it gone.
 */
export async function revokeConsent(request: FastifyRequest, reply: FastifyReply) {
  analyticsResponseHeaders(reply)

  // Cleared unconditionally, before anything can fail. A caller who revokes must
  // never end up with cookies still set because the delete errored.
  reply.clearCookie(VISITOR_COOKIE, trackingCookieOptions)
  reply.clearCookie(SESSION_COOKIE, trackingCookieOptions)
  reply.clearCookie(CONSENT_COOKIE, consentCookieOptions)

  if (request.visitorId === null) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send()
  }

  const result = await makeEraseAnalyticsDataUseCase().byVisitor(request.visitorId)

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
