import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import fastifyUnderPressure from '@fastify/under-pressure'
import { env } from '@config/env/index'
import { prisma } from '@infra/database/prisma'
import { HTTP_RATE_LIMIT_POLICIES } from '@common/plugins/policies/rate-limit'

const BYTES_PER_KILOBYTE = 1024
const BYTES_PER_MEGABYTE = BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE
const MAX_HEAP_USED_BYTES = 1_000_000_000
const MAX_RSS_BYTES = 1_000_000_000
const HEALTH_CHECK_INTERVAL_MS = 5000
const MAX_EVENT_LOOP_DELAY_TEST_MS = 50
const MAX_EVENT_LOOP_DELAY_DEFAULT_MS = 1000

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / BYTES_PER_MEGABYTE)}MB`
}

async function runHealthProbe() {
  const memoryUsage = process.memoryUsage()
  await prisma.$queryRaw`SELECT 1`

  return {
    status: 'ok',
    memory: {
      rss: formatMegabytes(memoryUsage.rss),
      heapUsed: formatMegabytes(memoryUsage.heapUsed),
      heapTotal: formatMegabytes(memoryUsage.heapTotal),
      external: formatMegabytes(memoryUsage.external),
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  }
}

const healthStatusRouteConfig = {
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
    status: { type: 'string' },
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
  url: '/health',
}

export const healthModule = fp(
  async (app: FastifyInstance) => {
    await app.register(fastifyUnderPressure, {
      maxEventLoopDelay: env.NODE_ENV === 'test' ? MAX_EVENT_LOOP_DELAY_TEST_MS : MAX_EVENT_LOOP_DELAY_DEFAULT_MS,
      maxHeapUsedBytes: MAX_HEAP_USED_BYTES,
      maxRssBytes: MAX_RSS_BYTES,
      healthCheckInterval: HEALTH_CHECK_INTERVAL_MS,
      exposeStatusRoute: healthStatusRouteConfig,
      healthCheck: runHealthProbe,
    })
  },
  { name: 'health-module' },
)
