import { FastifyInstance } from 'fastify'
import { healthCheck } from './health-check.controller'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

export async function healthCheckRoutes(app: FastifyInstance) {
  app.get('/', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.health.check } }, healthCheck)
}
