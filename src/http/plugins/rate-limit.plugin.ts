import rateLimit from '@fastify/rate-limit'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { getRedisRateLimit } from '@lib/redis/clients/clients'
import { rateLimitHealthProbeFor } from '@lib/infra/rate-limiter/rate-limit-health-probe'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

export const httpRateLimitPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRoute', (routeOptions) => {
    try {
      // Ensure a config object exists
      if (!routeOptions.config) {
        routeOptions.config = { rateLimit: HTTP_RATE_LIMIT_POLICIES.global }
        return
      }

      // Apply the global default policy only where the route did not choose one.
      // `??=` assigns on null/undefined alone, so a route that opted out with
      // `rateLimit: false` keeps that — the explicit guard this used to carry was
      // unreachable, which is how the mutation run found it.
      routeOptions.config.rateLimit ??= HTTP_RATE_LIMIT_POLICIES.global
    } catch {
      // Defensive: do not throw during route registration
    }
  })

  await app.register(rateLimit, {
    global: true,
    max: HTTP_RATE_LIMIT_POLICIES.global.max,
    timeWindow: HTTP_RATE_LIMIT_POLICIES.global.timeWindow,
    hook: 'onRequest',
    keyGenerator: (request) => request.ip,

    // Redis is the single source of truth for the limit. No local fallback and no
    // second counting algorithm: one limiter, one store.
    redis: getRedisRateLimit(),

    // Fail OPEN. The rate-limiter connection is deliberately impatient
    // (commandTimeout 100 ms, no offline queue, no retries), so `false` here made
    // a merely slow Redis return HTTP 500 to every caller — the limiter becoming
    // the outage it exists to prevent. Skipping the limit is the lesser harm; the
    // greater one would be doing it quietly, which is what the health probe below
    // is for.
    skipOnError: true,
  })

  // `skipOnError` is silent by design — the plugin swallows the store error and
  // offers no hook on it. The probe is what turns that silence into
  // `http_rate_limit_redis_up`, an alert, and a line in the log.
  const healthProbe = rateLimitHealthProbeFor(getRedisRateLimit())

  healthProbe.start()

  app.addHook('onClose', () => {
    healthProbe.stop()
  })
}

export const httpRateLimit = fp(httpRateLimitPlugin, {
  name: 'http-rate-limit',
})
