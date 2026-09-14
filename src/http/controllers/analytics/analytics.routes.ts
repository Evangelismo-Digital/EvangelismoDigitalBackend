/* eslint-disable max-lines-per-function */
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

import { ZodTypeProvider } from 'fastify-type-provider-zod'
import { trackEventsBatchSchema } from '@http/schemas/analytics/track-event-schema'
import {
  visitorAnalyticsParamsSchema,
  visitorAnalyticsQuerySchema,
  visitorsByUserQuerySchema,
} from '@http/schemas/analytics/visitor-analytics-schema'

const EVENTS_BODY_LIMIT = 16 * 1024

export async function analyticsRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  await app.register(ingestionRoutes)
  await app.register(adminReadRoutes)
}

async function ingestionRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  await app.register(analyticsIdentity)
  app.addHook('onRequest', verifyAnalyticsProxy)

  app.post(
    '/session',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session },
      schema: { tags: ['Analytics'], summary: 'Start session' },
    },
    startSession,
  )

  app.post(
    '/events',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.events },
      bodyLimit: EVENTS_BODY_LIMIT,
      schema: { tags: ['Analytics'], summary: 'Track events', body: trackEventsBatchSchema },
    },
    trackEvent,
  )

  app.post(
    '/identify',
    {
      onRequest: [verifyJwt],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify },
      schema: { tags: ['Analytics'], summary: 'Identify visitor' },
    },
    identifyVisitor,
  )

  app.post(
    '/consent/revoke',
    {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session },
      schema: { tags: ['Analytics'], summary: 'Revoke consent' },
    },
    revokeConsent,
  )

  app.delete(
    '/me',
    {
      onRequest: [verifyJwt],
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify },
      schema: { tags: ['Analytics'], summary: 'Erase my data' },
    },
    eraseMyData,
  )
}

async function adminReadRoutes(appInst: FastifyInstance) {
  const app = appInst.withTypeProvider<ZodTypeProvider>()
  const adminOnly = [verifyJwt, verifyUserRole([UserRole.ADMIN])]

  app.get(
    '/visitors',
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.read },
      schema: { tags: ['Analytics'], summary: 'List visitors by user', querystring: visitorsByUserQuerySchema },
    },
    listVisitorsByUser,
  )

  app.get(
    '/visitors/:visitorId',
    {
      onRequest: adminOnly,
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.read },
      schema: {
        tags: ['Analytics'],
        summary: 'Get visitor analytics',
        params: visitorAnalyticsParamsSchema,
        querystring: visitorAnalyticsQuerySchema,
      },
    },
    getVisitorAnalytics,
  )
}
