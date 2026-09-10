import { randomUUID } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  trackingCookieOptions,
} from '@http/cookies/options'
import { hasAnalyticsConsent } from '@http/cookies/consent'
import { HTTP_STATUS } from '@http/http-status'
import { getUserId } from '@lib/logger'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'
import { makeStartAnalyticsSessionUseCase } from '@use-cases/factories/make-start-analytics-session-use-case'
import { isErr } from 'core/shared/result'
import { HttpErrorMapper } from 'errors/http-errors/http-error-mapper'
import { analyticsResponseHeaders, sessionContext } from './session-context'

const startSessionSchema = z.object({
  /**
   * Forces a new session id even when the current one is still valid.
   *
   * The logout hook: without it, the next person to use this browser would keep
   * browsing inside the previous user's session.
   */
  rotate: z.boolean().default(false),
  // `.nullable().default(null)` rather than `.optional()` so the schema, not the
  // controller, is where "absent means null" is decided. The `?? null` chain it
  // replaces put four branches in a function whose only real decisions are
  // "consented?" and "did the write fail?".
  landingPath: z.string().min(1).max(VALIDATION_LIMITS.ANALYTICS_PATH_MAX).nullable().default(null),
  referrer: z.string().max(VALIDATION_LIMITS.ANALYTICS_REFERRER_MAX).nullable().default(null),
})

interface ResolvedIdentity {
  visitorId: string
  sessionId: string
  isNewVisitor: boolean
  isNewSession: boolean
}

/**
 * Which ids this visit runs under.
 *
 * A still-valid session is REUSED rather than replaced. The frontend calls this
 * once per page load, and on an App Router site always minting would fragment
 * one visit into many sessions and inflate `sessionCount` — the number that is
 * supposed to answer "how often do they come back".
 */
function resolveIdentity(request: FastifyRequest, rotate: boolean): ResolvedIdentity {
  // A rotation discards the presented session before anything else looks at it,
  // so "should this be a new session?" collapses into "is there one to reuse?".
  // Expressed this way the null-ness is what the compiler follows, rather than a
  // boolean it cannot relate back to the field.
  const reusableSession = rotate ? null : request.sessionId

  return {
    visitorId: request.visitorId ?? randomUUID(),
    sessionId: reusableSession ?? randomUUID(),
    isNewVisitor: request.visitorId === null,
    isNewSession: reusableSession === null,
  }
}

function issueCookies(reply: FastifyReply, identity: ResolvedIdentity): void {
  reply.setCookie(VISITOR_COOKIE, identity.visitorId, { ...trackingCookieOptions, maxAge: VISITOR_MAX_AGE })
  reply.setCookie(SESSION_COOKIE, identity.sessionId, { ...trackingCookieOptions, maxAge: SESSION_MAX_AGE })
}

/**
 * The ONLY route that emits analytics cookies (§3.2).
 *
 * Concentrating minting here is what makes the visitor count mean something: a
 * caller that does not keep cookies is answered 204 by `/events` and writes no
 * row, rather than minting a fresh visitor on every request.
 */
export async function startSession(request: FastifyRequest, reply: FastifyReply) {
  analyticsResponseHeaders(reply)

  // No consent: no identity, no row, and no explanation — the caller has nothing
  // to do differently either way (§5.1).
  if (!hasAnalyticsConsent(request)) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send()
  }

  const body = startSessionSchema.parse(request.body ?? {})
  const identity = resolveIdentity(request, body.rotate)

  issueCookies(reply, identity)

  const result = await makeStartAnalyticsSessionUseCase().execute({
    ...identity,
    userId: getUserId() ?? null,
    landingPath: body.landingPath,
    referrer: body.referrer,
    ...sessionContext(request),
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
