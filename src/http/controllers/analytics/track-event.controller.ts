import type { FastifyReply, FastifyRequest } from 'fastify'
import { SESSION_COOKIE, SESSION_MAX_AGE, trackingCookieOptions } from '@http/cookies/options'
import { hasAnalyticsConsent } from '@http/cookies/consent'
import { HTTP_STATUS } from '@http/http-status'
import { getUserId } from '@lib/logger'
import { trackEventsBatchSchema } from '@schemas/analytics/track-event-schema'
import { makeTrackAnalyticsUseCase } from '@use-cases/factories/make-track-analytics-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { analyticsResponseHeaders, sessionContext } from './session-context'

/**
 * The identity this batch may be written under, or null to discard it.
 *
 * Returned as a narrowed pair rather than checked inline so the controller has
 * one decision ("may we ingest?") instead of three, and so the non-null
 * narrowing survives into the write without an assertion.
 */
function ingestibleIdentity(request: FastifyRequest): { visitorId: string; sessionId: string } | null {
  const { visitorId, sessionId } = request

  if (visitorId === null || sessionId === null || !hasAnalyticsConsent(request)) {
    return null
  }

  return { visitorId, sessionId }
}

/**
 * Ingests a batch of events for an ALREADY-ESTABLISHED identity.
 *
 * This route never creates identity. Without a valid signed visitor and session
 * cookie the batch is discarded and answered `204` — silently, because a `400`
 * would teach a probing caller exactly what to correct, and the frontend has
 * nothing useful to do with the failure either way (§3.2).
 */
export async function trackEvent(request: FastifyRequest, reply: FastifyReply) {
  analyticsResponseHeaders(reply)

  const identity = ingestibleIdentity(request)

  if (identity === null) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send()
  }

  const { events } = trackEventsBatchSchema.parse(request.body)

  // Renewing, not minting: the SAME session id is re-sent with a fresh 30-minute
  // window, which is what makes the window slide from last activity rather than
  // from bootstrap. A visitor reading one long post for 40 minutes would
  // otherwise silently stop being recorded mid-read (§3.4).
  reply.setCookie(SESSION_COOKIE, identity.sessionId, { ...trackingCookieOptions, maxAge: SESSION_MAX_AGE })

  const context = sessionContext(request)
  const userId = getUserId() ?? null
  const trackAnalyticsUseCase = makeTrackAnalyticsUseCase()

  for (const event of events) {
    const result = await trackAnalyticsUseCase.execute({
      ...identity,
      userId,
      ...context,
      ...event,
    })

    if (isErr(result)) {
      return HttpErrorMapper.map(result.error, reply)
    }
  }

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
