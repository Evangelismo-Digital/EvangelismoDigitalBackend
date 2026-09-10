import type { FastifyReply, FastifyRequest } from 'fastify'
import { env } from '@env/index'
import { hasAnalyticsConsent } from '@http/cookies/consent'
import { HTTP_STATUS } from '@http/http-status'
import { getUserId } from '@lib/logger'
import { makeIdentifyVisitorUseCase } from '@use-cases/factories/make-identify-visitor-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { analyticsResponseHeaders } from './session-context'

/**
 * Joins the anonymous half of a visit to the authenticated user (§3.7).
 *
 * The security rule here is not negotiable: `userId` comes from the verified
 * JWT via `getUserId()`, NEVER from the request body. Accepting it from the body
 * would let any caller attribute someone else's browsing to themselves — or
 * their own browsing to someone else. The body is not read at all.
 */
export async function identifyVisitor(request: FastifyRequest, reply: FastifyReply) {
  analyticsResponseHeaders(reply)

  const userId = getUserId()

  // `verifyJwt` runs first and answers 401, so this is unreachable in practice;
  // it is here because the use-case requires a non-null userId and a type
  // assertion would be a worse way to say the same thing.
  if (!userId) {
    return reply.code(HTTP_STATUS.UNAUTHORIZED).send()
  }

  // Nothing to stitch without an established visitor, and this route may not
  // create one — only /session may (§3.2).
  if (request.visitorId === null || !hasAnalyticsConsent(request)) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send()
  }

  const result = await makeIdentifyVisitorUseCase().execute({
    visitorId: request.visitorId,
    sessionId: request.sessionId,
    backfillEarlierSessions: env.ANALYTICS_BACKFILL_IDENTITY,
    userId,
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
