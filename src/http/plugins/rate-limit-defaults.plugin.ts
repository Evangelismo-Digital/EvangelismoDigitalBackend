import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

const rateLimitDefaultsPlugin: FastifyPluginAsync = async (app) => {
  app.addHook('onRoute', (routeOptions) => {
    try {
      // Ensure a config object exists
      if (!routeOptions.config) {
        ;(routeOptions as any).config = { rateLimit: HTTP_RATE_LIMIT_POLICIES.global }
        return
      }

      // If route has explicitly disabled rateLimit (false), keep it disabled
      if (routeOptions.config.rateLimit === false) {
        return
      }

      // If route did not set a rateLimit, apply the global default policy
      if (routeOptions.config.rateLimit == null) {
        ;(routeOptions.config as any).rateLimit = HTTP_RATE_LIMIT_POLICIES.global
      }
    } catch {
      // Defensive: do not throw during route registration
    }
  })
}

export const httpRateLimitDefaults = fp(rateLimitDefaultsPlugin, {
  name: 'http-rate-limit-defaults',
})
