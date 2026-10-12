import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import '@fastify/cookie'
import { SESSION_COOKIE, VISITOR_COOKIE } from '@http/cookies/options'
import { collectMetricsAnalyticsCookieSupersededSecret } from '@lib/metrics/analytics-metrics'

declare module 'fastify' {
  interface FastifyRequest {
    /** null when the caller presented no valid signed visitor cookie. */
    visitorId: string | null
    sessionId: string | null
  }
}

/**
 * The id carried by a signed cookie, or null.
 *
 * `valid: false` covers a tampered signature; checking the value covers an empty
 * cookie, which unsigns "successfully" to an empty string and would otherwise
 * become a visitor id of ''.
 */
function readSigned(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name]

  if (!raw) {
    return null
  }

  const unsigned = request.unsignCookie(raw)

  if (!unsigned.valid || !unsigned.value) {
    return null
  }

  // `renew` means the signature verified against COOKIE_SECRET_PREVIOUS rather
  // than the current key. The cookie stays valid — that is the whole point of
  // the rotation window — and `/session` re-signs it on the visitor's next page
  // load, so nothing needs doing here. It is COUNTED because dropping the
  // previous secret invalidates every cookie still carrying it, and this is the
  // only signal that says whether that is nobody or a large share of traffic.
  if (unsigned.renew) {
    collectMetricsAnalyticsCookieSupersededSecret?.inc({ cookie: name })
  }

  return unsigned.value
}

/**
 * Reads analytics identity from cookies. It does not mint any.
 *
 * Two deliberate departures from what this replaced:
 *
 * 1. NO EMISSION. The previous hook minted a visitor and session id on any
 *    request that lacked them, which meant every event created identity: a page
 *    load firing several requests could mint several visitors, `/health` was
 *    answered with `Set-Cookie` (making it uncacheable and burning HMAC on every
 *    load-balancer probe), and any client that discards cookies inflated the
 *    visitor count by one per request. Emission now happens in exactly one
 *    place, the `/session` controller — §3.2.
 *
 * 2. NO try/catch FALLBACK. The old hook caught a failed unsign and substituted
 *    a fresh random id, so a tampered cookie silently became a brand-new
 *    visitor. The correct answer to "this signature does not verify" is null,
 *    and the event is discarded — §4.3.
 *
 * ON `fastify-plugin`, and why the specification's snippet does not work.
 *
 * §3.3 shows this registered WITHOUT `fp`, reasoning that encapsulation is the
 * point. The reasoning is right and the mechanism is wrong: `app.register()`
 * creates a CHILD context, so hooks declared inside apply to that child and its
 * descendants — and the routes registered next to it are siblings, not
 * descendants. The hook never runs for them. Verified the expensive way: every
 * request arrived with `visitorId === undefined`, which slipped past a
 * `=== null` guard and reached the database as a null visitor id.
 *
 * `fp` applies this to the ENCLOSING scope, which is `analyticsRoutes` — itself
 * registered under a prefix and therefore already its own encapsulation context.
 * The boundary that keeps /health free of Set-Cookie is that registration, not
 * this one. Item 4 stays fixed; the hook now actually runs.
 */
const analyticsIdentityPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('visitorId', null)
  app.decorateRequest('sessionId', null)

  app.addHook('preHandler', async (request) => {
    request.visitorId = readSigned(request, VISITOR_COOKIE)
    request.sessionId = readSigned(request, SESSION_COOKIE)
  })
}

export const analyticsIdentity = fp(analyticsIdentityPlugin, { name: 'analytics-identity' })
