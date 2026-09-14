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
import { requestDeadline } from '@http/plugins/deadline.plugin'
import { cookieSigningSecrets } from '@http/cookies/cookie-secrets'
import metricsPlugin from 'fastify-metrics'
import promClient from 'prom-client'
import { getRegistry } from '@lib/metrics'
import { jsonSchemaTransform, ZodTypeProvider } from 'fastify-type-provider-zod'
import fastifySwagger from '@fastify/swagger'
import scalarApiReference from '@scalar/fastify-api-reference'

z.config(z.locales.pt())

export const app = fastify({
  logger: false,
  trustProxy: true,
  genReqId: () => uuidv7(),
}).withTypeProvider<ZodTypeProvider>()

app.register(fastifySwagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'Evangelismo Digital API',
      version: '1.0.0',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
  },
  transform: jsonSchemaTransform,
})

app.register(scalarApiReference, {
  routePrefix: '/docs',
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

// Security headers — strict CSP for JSON APIs
import fastifyHelmet from '@fastify/helmet'
app.register(fastifyHelmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
})

// Load shedding and health checks
import fastifyUnderPressure from '@fastify/under-pressure'
import { prisma } from '@lib/prisma'
import { HTTP_RATE_LIMIT_POLICIES } from '@http/policies/rate-limit'

const MAX_EVENT_LOOP_DELAY_TEST = 5
const MAX_EVENT_LOOP_DELAY_DEFAULT = 1000

app.register(fastifyUnderPressure, {
  maxEventLoopDelay: env.NODE_ENV === 'test' ? MAX_EVENT_LOOP_DELAY_TEST : MAX_EVENT_LOOP_DELAY_DEFAULT,
  maxHeapUsedBytes: 1000000000, // 1GB
  maxRssBytes: 1000000000, // 1GB
  healthCheckInterval: 5000,
  exposeStatusRoute: {
    routeOpts: {
      config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.health.check },
      schema: {
        tags: ['Health'],
        summary: 'Verifica o status da aplicação',
        description:
          'Retorna informações sobre uso de memória e tempo de atividade se o banco de dados estiver acessível.',
      },
    },
    routeResponseSchemaOpts: {
      uptime: { type: 'number' },
      timestamp: { type: 'string' },
      memory: {
        type: 'object',
        properties: {
          rss: { type: 'string' },
          heapUsed: { type: 'string' },
          heapTotal: { type: 'string' },
          external: { type: 'string' },
        },
      },
    },
    url: '/health/',
  },
  healthCheck: async () => {
    // Moved from health-check.controller.ts
    const memoryUsage = process.memoryUsage()
    await prisma.$queryRaw`SELECT 1`

    return {
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
      },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }
  },
})

// Cookies parser & signer. The secret is an array so a key can be rotated
// without invalidating cookies already issued — see cookie-secrets.ts.
app.register(fastifyCookie, {
  secret: cookieSigningSecrets(env.COOKIE_SECRET, env.COOKIE_SECRET_PREVIOUS),
})

// Analytics identity is deliberately NOT registered here. It is encapsulated
// inside `analyticsRoutes`, so cookie reading applies only to /analytics/*.
// Registered globally, it answered every route — including /health — with
// Set-Cookie, which made health responses uncacheable and had the load
// balancer's probe minting a throwaway visitor on every check. See §3.3.

// 4. JWT — decorates app with jwtVerify (no interception)
app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
})

// 5. Request lifecycle — JWT extraction, userId population, request/response logging
app.register(requestLifecycle)

// 5.5 Request deadline — establishes the single clock a request is measured
// against, linked to the client disconnecting. Registered before routes so the
// handler can hand it straight to its use-case.
app.register(requestDeadline)

// 6. Error handler — catches anything thrown by plugins and routes
app.register(errorHandler)

// 7. Routes
app.register(appRoutes)

// Graceful shutdown — application-level resource cleanup
app.addHook('onClose', async () => {
  logger.info('Finalizando as conexões do RateLimiter e Redis...')

  try {
    RedisRateLimiter.destroyInstance()
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
