import fastify from 'fastify'
import { env } from '@env/index'
import { appRoutes } from '@http/routes'
import { logger } from '@lib/logger'
import { v7 as uuidv7 } from 'uuid'
import z from 'zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { asyncContext } from '@http/plugins/async-context.plugin'
import { closeAllRedisConnections } from '@lib/redis/clients/clients'
import { httpRateLimit } from '@http/plugins/rate-limit.plugin'
import { httpRateLimitDefaults } from '@http/plugins/rate-limit-defaults.plugin'
import { errorHandler } from '@http/plugins/error-handler.plugin'
import { requestLifecycle } from '@http/plugins/request-lifecycle.plugin'
import { memoryMonitor } from '@http/plugins/memory-monitor.plugin'

z.config(z.locales.pt())

export const app = fastify({
  logger: false,
  trustProxy: true,
  genReqId: () => uuidv7(),
})

// 1. AsyncContext — wraps every request in ALS with requestId from genReqId
app.register(asyncContext)

// 2. CORS — short-circuits OPTIONS before auth/lifecycle
app.register(fastifyCors, {
  origin: env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization'],
  maxAge: 3600,
})

// 3. Rate limiting — drops abusive traffic before any crypto work
app.register(httpRateLimitDefaults)
app.register(httpRateLimit)

// 4. JWT — decorates app with jwtVerify (no interception)
app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
})

// 5. Request lifecycle — JWT extraction, userId population, request/response logging
app.register(requestLifecycle)

// 6. Memory monitor — production heap monitoring with self-contained lifecycle
app.register(memoryMonitor)

// 7. Routes
app.register(appRoutes)

// 8. Error handler — always last to catch anything thrown by plugins and routes
app.register(errorHandler)

// Graceful shutdown — application-level resource cleanup
app.addHook('onClose', async () => {
  logger.info('🛑 Shutting down RateLimiter and Redis connections...')

  try {
    await RedisRateLimiter.destroyInstance()
    logger.info('✅ RateLimiter destroyed')
  } catch (error) {
    logger.error(error, '❌ Error destroying RateLimiter')
  }

  try {
    await closeAllRedisConnections()
    logger.info('✅ Redis connections closed')
  } catch (error) {
    logger.error(error, '❌ Error closing Redis connections')
  }
})
