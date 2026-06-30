import fastify from 'fastify'
import { env } from '@env/index'
import { appRoutes } from '@http/routes'
import { logger, runWithRequestId, runWithUserContext } from '@lib/logger'
import { v7 as uuidv7 } from 'uuid'
import z from 'zod'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'
import { RedisRateLimiter } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { asyncContext } from '@http/plugins/async-context.plugin'
import { closeAllRedisConnections } from '@lib/redis/clients/clients'
import { httpRateLimit } from '@http/plugins/rate-limit.plugin'
import { httpRateLimitDefaults } from '@http/plugins/rate-limit-defaults.plugin'
import { errorHandler } from '@http/plugins/error-handler.plugin'
z.config(z.locales.pt())

export const app = fastify({
  logger: false,
  trustProxy: true,
})

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profileSessionSampleRate: 1.0,
    profileLifecycle: 'trace',
  })

  Sentry.setupFastifyErrorHandler(app)
}

let memoryInterval: NodeJS.Timeout | null = null

if (env.NODE_ENV === 'production') {
  memoryInterval = setInterval(() => {
    const memUsage = process.memoryUsage()
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024
    const rssMB = memUsage.rss / 1024 / 1024

    // Alert at 400MB heap usage (80% of 512MB Docker limit)
    if (heapUsedMB > 400) {
      logger.warn({
        msg: 'High memory usage detected',
        heapUsedMB: Math.round(heapUsedMB),
        rssMB: Math.round(rssMB),
        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024),
      })
    }
  }, 60000)
}

app.register(asyncContext)

app.register(httpRateLimitDefaults)

app.addHook('onRequest', (request, _reply, done) => {
  const requestId = uuidv7()
  const xff = request.headers['x-forwarded-for']
  const clientIp = Array.isArray(xff) ? xff[0] : xff?.split(',')[0].trim() || request.ip

  runWithRequestId(requestId, async () => {
    try {
      const decoded = await request.jwtVerify<{ sub: string }>()
      runWithUserContext(decoded.sub, () => {
        logRequestDetails()
        done()
      })
    } catch {
      logRequestDetails()
      done()
    }

    function logRequestDetails() {
      logger.info(
        {
          method: request.method,
          url: request.url,
          ip: clientIp,
          remotePort: request.socket.remotePort,
          userAgent: request.headers['user-agent'],
        },
        'Incoming request',
      )
    }
  })
})

app.addHook('onResponse', (request, reply, done) => {
  logger.info(
    {
      statusCode: reply.statusCode,
      method: request.method,
      url: request.url,
      requestTime: reply.elapsedTime,
    },
    'Response sent',
  )

  done()
})

app.register(fastifyCors, {
  origin: env.FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Authorization'],
  maxAge: 3600,
})

app.register(httpRateLimit)

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
})

app.register(appRoutes)

app.register(errorHandler)

app.addHook('onClose', async () => {
  logger.info('🛑 Shutting down RateLimiter and Redis connections...')

  if (memoryInterval) {
    clearInterval(memoryInterval)
    logger.info('✅ Memory monitor interval cleared')
  }

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
