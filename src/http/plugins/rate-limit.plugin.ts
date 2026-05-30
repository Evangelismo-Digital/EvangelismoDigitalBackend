import rateLimit from '@fastify/rate-limit'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'
import { getRedisRateLimit } from '@lib/redis/clients/clients'
import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

export const httpRateLimitPlugin: FastifyPluginAsync = async (app) => {
  await app.register(rateLimit, {
    global: true,
    max: HTTP_RATE_LIMIT_POLICIES.global.max,
    timeWindow: HTTP_RATE_LIMIT_POLICIES.global.timeWindow,
    hook: 'onRequest',
    keyGenerator: (request) => request.ip,
    redis: getRedisRateLimit(),
    skipOnError: true,
  })
}

export const httpRateLimit = fp(httpRateLimitPlugin, {
  name: 'http-rate-limit',
})
