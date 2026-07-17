import Fastify, { FastifyInstance } from 'fastify'
import { Counter } from 'prom-client'
import { getRegistry } from '@lib/metrics'
import { env } from '@env/index'
import { logger } from '@lib/logger'

let metricsServer: FastifyInstance | null = null

const registry = getRegistry()

const metricsCollectionErrors = registry
  ? new Counter({
      name: 'metrics_collection_errors_total',
      help: 'Errors during metrics collection',
      labelNames: ['source'],
      registers: [registry],
    })
  : null

interface StartOptions {
  port: number
}

function withTimeout(promise: Promise<string>, ms: number, source: string): Promise<string> {
  return Promise.race([
    promise,
    new Promise<string>((_, reject) => {
      setTimeout(() => {
        metricsCollectionErrors?.inc({ source })
        reject(new Error(`${source} timeout`))
      }, ms)
    }),
  ])
}

export async function startMetricsServer(options: StartOptions): Promise<void> {
  if (!env.METRICS_ENABLED) {
    logger.info('Metrics server disabled')
    return
  }

  metricsServer = Fastify({ logger: false })

  metricsServer.get('/metrics', async (_request, reply) => {
    const currentRegistry = getRegistry()
    if (!currentRegistry) {
      return reply.status(503).send('Metrics disabled')
    }

    const results = await Promise.allSettled([withTimeout(currentRegistry.metrics(), 2000, 'prom-client')])

    const output = results
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value)
      .join('\n\n')

    reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
    return output
  })

  metricsServer.get('/health', async () => ({ status: 'ok' }))

  await metricsServer.listen({ host: '0.0.0.0', port: options.port })
  logger.info({ port: options.port }, 'Metrics server started')
}

export async function stopMetricsServer(): Promise<void> {
  if (metricsServer) {
    await metricsServer.close()
    metricsServer = null
    logger.info('Metrics server stopped')
  }
}
