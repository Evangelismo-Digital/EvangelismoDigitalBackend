import rateLimit from '@fastify/rate-limit'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { getRedisRateLimit } from '@lib/redis/clients/clients'
import { resilientRateLimitStoreFor } from '@lib/infra/rate-limiter/resilient-rate-limit-store'
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

    // Not `redis:`. That option installs the plugin's own Redis store, which
    // hands Redis failures straight to the request — and with `skipOnError: false`
    // a 100 ms Redis timeout became an HTTP 500 for every caller. This store
    // falls back to counting in-process instead, so the limiter degrades where it
    // used to take the API down with it.
    store: resilientRateLimitStoreFor(getRedisRateLimit()),

    // Kept false deliberately. The store above resolves rather than rejects, so
    // nothing routine reaches this switch any more; if something ever does, it is
    // a bug in the store and must be loud rather than silently unlimited.
    skipOnError: false,
  })
}

export const httpRateLimit = fp(httpRateLimitPlugin, {
  name: 'http-rate-limit',
})
