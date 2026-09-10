import { FastifyInstance } from 'fastify'
import { UserRole } from '@prisma/client'
import { analyticsIdentity } from '@http/plugins/analytics-identity.plugin'
import { verifyAnalyticsProxy } from '@middlewares/verify-analytics-proxy.middleware'
import { verifyJwt } from '@middlewares/verify-jwt.middleware'
import { verifyUserRole } from '@middlewares/verify-user-role.middleware'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { eraseMyData } from './erase-my-data.controller'
import { getVisitorAnalytics } from './get-visitor-analytics.controller'
import { identifyVisitor } from './identify-visitor.controller'
import { listVisitorsByUser } from './list-visitors-by-user.controller'
import { revokeConsent } from './revoke-consent.controller'
import { startSession } from './start-session.controller'
import { trackEvent } from './track-event.controller'

/**
 * Transport ceiling for an event batch: 16 KiB against Fastify's 1 MiB default.
 *
 * 50 events of bounded strings do not approach this. It exists so a caller
 * cannot make the server parse a megabyte before the schema rejects it.
 */
const EVENTS_BODY_LIMIT = 16 * 1024

/**
 * Two sibling scopes with different authentication models.
 *
 * `app.register` gives each its own encapsulation context, so the proxy hook on
 * the ingestion side does not reach the read side. That is the same Fastify
 * behaviour that made §3.3's snippet fail — hooks apply to a plugin's
 * descendants, never to its siblings — used deliberately here.
 */
export async function analyticsRoutes(app: FastifyInstance) {
  await app.register(ingestionRoutes)
  await app.register(adminReadRoutes)
}

/**
 * Browser-facing ingestion. Reaches the API only through the first-party Next.js
 * proxy, and carries analytics identity read from cookies.
 */
async function ingestionRoutes(app: FastifyInstance) {
  await app.register(analyticsIdentity)

  app.addHook('onRequest', verifyAnalyticsProxy)

  app.post('/session', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session } }, startSession)

  app.post(
    '/events',
    { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.events }, bodyLimit: EVENTS_BODY_LIMIT },
    trackEvent,
  )

  app.post(
    '/identify',
    {
      // `verifyJwt` and not merely reading the ALS: identify is the one analytics
      // route where an unauthenticated call is a client bug worth surfacing
      // rather than a visitor to ignore.
      onRequest: [verifyJwt],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify },
    },
    identifyVisitor,
  )

  // Unauthenticated on purpose — see the controller. Rate-limited with the
  // /session policy: revocation is a once-per-visit action.
  app.post('/consent/revoke', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session } }, revokeConsent)

  app.delete(
    '/me',
    { onRequest: [verifyJwt], config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify } },
    eraseMyData,
  )
}

/**
 * Dashboard reads, for an operator rather than a visitor.
 *
 * Deliberately OUTSIDE the `X-Analytics-Proxy` gate. That header proves a
 * request came from the Next server; a dashboard call originates in an
 * operator's browser, where CORS permits only `Content-Type` and
 * `Authorization` — and shipping the shared secret to a browser to satisfy the
 * check would publish it in devtools and defeat the gate for the ingestion
 * routes it actually protects.
 *
 * Nothing is lost by that: the gate exists to stop anonymous writes minting
 * identity, and these routes only read. JWT plus an ADMIN role is the stronger
 * control, and it is the same one every other administrative route here uses.
 */
async function adminReadRoutes(app: FastifyInstance) {
  const adminOnly = [verifyJwt, verifyUserRole([UserRole.ADMIN])]

  app.get(
    '/visitors',
    { onRequest: adminOnly, config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.read } },
    listVisitorsByUser,
  )

  app.get(
    '/visitors/:visitorId',
    { onRequest: adminOnly, config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.read } },
    getVisitorAnalytics,
  )
}
