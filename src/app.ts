import fastify from 'fastify'
import { env } from '@env/index'
import { appRoutes } from '@http/routes'
import { logger } from '@lib/logger'
import { v7 as uuidv7 } from 'uuid'
import z from 'zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { asyncContext } from '@http/plugins/async-context.plugin'
import { closeAllRedisConnections } from '@lib/redis/clients/clients'
import { httpRateLimit } from '@http/plugins/rate-limit.plugin'
import { errorHandler } from '@http/plugins/error-handler.plugin'
import { requestLifecycle } from '@http/plugins/request-lifecycle.plugin'
import { analytics } from '@http/plugins/analytics.plugin'
import metricsPlugin from 'fastify-metrics'
import promClient from 'prom-client'
import { getRegistry } from '@lib/metrics'

z.config(z.locales.pt())

export const app = fastify({
  logger: false,
  trustProxy: true,
  genReqId: () => uuidv7(),
})

// 1. AsyncContext — wraps every request in ALS with requestId from genReqId
app.register(asyncContext)

// 1.5 HTTP metrics — per-route request duration histogram into the shared
// metrics registry (served by the dedicated metrics-server, not this port).
// Skipped entirely when METRICS_ENABLED=false (getRegistry() returns null).
const metricsRegistry = getRegistry()
if (metricsRegistry) {
  app.register(metricsPlugin, {
    promClient,
    endpoint: null,
    defaultMetrics: { enabled: false },
    routeMetrics: {
      enabled: { histogram: true, summary: false },
      overrides: {
        histogram: { registers: [metricsRegistry] },
      },
    },
  })
}

// 2. CORS — short-circuits OPTIONS before auth/lifecycle / rate limit
app.register(fastifyCors, {
  origin: env.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization'],
  maxAge: 3600,
})

// 3. Rate limiting — drops abusive traffic before any crypto/cookie work
app.register(httpRateLimit)

// Cookies parser & signer
app.register(fastifyCookie, {
  secret: env.COOKIE_SECRET,
})

// Analytics sessions and events tracking
app.register(analytics)

// 4. JWT — decorates app with jwtVerify (no interception)
app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
})

// 5. Request lifecycle — JWT extraction, userId population, request/response logging
app.register(requestLifecycle)

// 6. Error handler — catches anything thrown by plugins and routes
app.register(errorHandler)

// 7. Routes
app.register(appRoutes)

// Graceful shutdown — application-level resource cleanup
app.addHook('onClose', async () => {
  logger.info('Finalizando as conexões do RateLimiter e Redis...')

  try {
    await RedisRateLimiter.destroyInstance()
    logger.info('RateLimiter finalizado com sucesso')
  } catch (error) {
    logger.error(error, 'Erro ao finalizar o RateLimiter')
  }

  try {
    await closeAllRedisConnections()
    logger.info('Conexões do Redis fechadas')
  } catch (error) {
    logger.error(error, 'Erro ao fechar as conexões do Redis')
  }
})
