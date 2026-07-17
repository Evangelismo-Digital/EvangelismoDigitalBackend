import rateLimit from '@fastify/rate-limit'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { getRedisRateLimit } from '@lib/redis/clients/clients'
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

      // If route has explicitly disabled rateLimit (false), keep it disabled
      if (routeOptions.config.rateLimit === false) {
        return
      }

      // If route did not set a rateLimit, apply the global default policy
      if (routeOptions.config.rateLimit == null) {
        routeOptions.config.rateLimit = HTTP_RATE_LIMIT_POLICIES.global
      }
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
    redis: getRedisRateLimit(),
    skipOnError: false,
  })
}

export const httpRateLimit = fp(httpRateLimitPlugin, {
  name: 'http-rate-limit',
})
