import Fastify, { FastifyInstance } from 'fastify'
import { Counter } from 'prom-client'
import { getRegistry } from '@lib/metrics'
import { collectBullMQMetrics } from '@lib/metrics/bullmq-metrics'
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

function withTimeout<T>(promise: Promise<T>, ms: number, source: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        metricsCollectionErrors?.inc({ source })
        reject(new Error(`${source} timeout`))
      }, ms)
    }),
  ])
}

export async function startMetricsServer(options: StartOptions): Promise<void> {
  if (!env.METRICS_ENABLED) {
    logger.info('Servidor de métricas desabilitado')
    return
  }

  metricsServer = Fastify({ logger: false })

  metricsServer.get('/metrics', async (_request, reply) => {
    const currentRegistry = getRegistry()
    if (!currentRegistry) {
      return reply.code(503).send('Metrics disabled')
    }

    // Lazy BullMQ collection: pull job counts from Redis just before serializing,
    // so bullmq_jobs is fresh in this scrape. No-op on the API process (no queues).
    try {
      await withTimeout(collectBullMQMetrics(), 2000, 'bullmq')
    } catch (err) {
      logger.warn({ err }, 'Falha na coleta de métricas do BullMQ')
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
  logger.info({ port: options.port }, 'Servidor de métricas iniciado')
}

export async function stopMetricsServer(): Promise<void> {
  if (metricsServer) {
    await metricsServer.close()
    metricsServer = null
    logger.info('Servidor de métricas parado')
  }
}
