import { initSentry } from '@infra/sentry/init'

// Initialize Sentry at process startup
initSentry()

import { startMaintenanceScheduler } from '@infra/outbox/jobs/maintenance-scheduler'
import { startMaintenanceWorker } from '@infra/outbox/jobs/maintenance-worker'
import { getMaintenanceQueue } from '@infra/outbox/queue/maintenance-queue'
import { OutboxProcessor } from '@infra/outbox/jobs/outbox-processor'
import { OutboxMaintenance } from '@infra/outbox/jobs/outbox-maintenance'
import { AnalyticsRetention } from '@infra/outbox/jobs/analytics-retention'
import { PrismaAnalyticsRepository } from '@modules/analytics/repositories/prisma-analytics.repository'
import { makeOutboxDispatchStrategyRegistry } from '@infra/outbox/jobs/make-outbox-dispatch-registry'
import { logger } from '@infra/logger'
import { captureError } from '@infra/sentry/capture'
import { DatabaseContext } from '@infra/database/prisma/helpers/database-context'
import { closeAllRedisConnections } from '@infra/redis/clients/clients'
import { startMailWorker } from '@infra/mail/workers/mail-worker'
import { startOutboxDispatchWorker } from '@infra/outbox/workers/outbox-dispatch-worker'
import { getOutboxDispatchQueue, closeOutboxDispatchQueue } from '@infra/outbox/queue/outbox-dispatch-queue'
import { PrismaOutboxRepository } from '@infra/outbox/repositories/prisma-outbox-event.repository'
import { PrismaErrorMapper } from '@infra/database/prisma/utils/prisma-error-mapper'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@infra/outbox/repositories/errors/outbox-error-mapping'
import { Worker } from 'bullmq'
import { crashShutdown } from '@infra/shutdown/crash-shutdown'
import closeWithGrace from 'close-with-grace'
import { env } from '@config/env/index'
import { getMailQueue } from '@infra/mail/queue/mail-queue'
import { registerQueue, unregisterQueue } from '@infra/metrics/bullmq-metrics'
import { QUEUE } from '@common/messages/constants/queue/queue'
import { startMetricsServer, stopMetricsServer } from './metrics-server'

let worker: Worker | null = null
let outboxDispatchWorker: Worker | null = null
let maintenanceWorker: Worker | null = null

/**
 * [ESCALABILIDADE HORIZONTAL]
 * A manutenção agendada e o despacho de outbox são totalmente seguros com N pods:
 * - A fila `outbox-dispatch-queue` substitui o Pub/Sub, garantindo entrega point-to-point
 *   a apenas 1 pod por evento, além de durabilidade se todos os workers estiverem fora.
 * - O CAS otimista `claim()` no PostgreSQL impede corrida entre a varredura e o despacho em tempo real.
 * - Os agendamentos vivem no Redis via Job Schedulers do BullMQ: 1 job por tique para todo o cluster.
 */
async function startMaintenance(
  outboxRepository: PrismaOutboxRepository,
  outboxProcessor: OutboxProcessor,
): Promise<void> {
  maintenanceWorker = startMaintenanceWorker({
    processor: outboxProcessor,
    maintenance: new OutboxMaintenance(outboxRepository),
    analyticsRetention: new AnalyticsRetention(new PrismaAnalyticsRepository()),
  })

  registerQueue(QUEUE.NAMES.MAINTENANCE, getMaintenanceQueue())

  await startMaintenanceScheduler()
}

async function bootstrap() {
  try {
    logger.info('Inicializando serviços de background...')

    const dbContext = new DatabaseContext()
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

    worker = startMailWorker(outboxRepository)
    logger.info('Mail worker iniciado')
    registerQueue(QUEUE.NAMES.MAIL, getMailQueue())

    const outboxProcessor = new OutboxProcessor(outboxRepository, makeOutboxDispatchStrategyRegistry())

    outboxDispatchWorker = startOutboxDispatchWorker(outboxProcessor)
    logger.info('Outbox dispatch worker iniciado')
    registerQueue(QUEUE.NAMES.OUTBOX_DISPATCH, getOutboxDispatchQueue())

    await startMaintenance(outboxRepository, outboxProcessor)

    // Metrics server is auxiliary: a bind failure must not take down the worker.
    try {
      await startMetricsServer({ port: env.METRICS_WORKER_PORT })
    } catch (metricsErr) {
      logger.error(
        { err: metricsErr },
        'Falha ao iniciar o servidor de métricas do worker; o worker continuará sem métricas',
      )
      captureError(metricsErr)
    }
  } catch (error) {
    await crashShutdown(error)
  }
}

// eslint-disable-next-line max-lines-per-function
async function cleanup() {
  const tasks: (() => Promise<void> | void)[] = [
    async () => {
      if (outboxDispatchWorker) {
        await outboxDispatchWorker.close()
        logger.info('Outbox dispatch worker finalizado')
      }
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.OUTBOX_DISPATCH)
      await closeOutboxDispatchQueue()
      logger.info('OutboxDispatchQueue finalizada')
    },
    async () => {
      if (worker) {
        await worker.close()
        logger.info('Worker finalizado')
      }
    },
    async () => {
      if (maintenanceWorker) {
        await maintenanceWorker.close()
        logger.info('Worker de manutenção finalizado')
      }
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.MAIL)
      await getMailQueue().close()
      logger.info('MailQueue finalizada')
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.MAINTENANCE)
      await getMaintenanceQueue().close()
      logger.info('MaintenanceQueue finalizada')
    },
    stopMetricsServer,
    async () => {
      await closeAllRedisConnections()
      logger.info('Conexões Redis finalizadas')
    },
  ]
  for (const task of tasks) {
    try {
      await task()
    } catch (err) {
      logger.error(err, 'Erro durante o encerramento do worker')
    }
  }
}

closeWithGrace(
  {
    delay: 15_000,
    onTimeout: () => {
      logger.fatal('O tempo limite de limpeza para encerramento expirou após 15s. Forçando a saída.')
    },
  },
  async ({ signal, err }) => {
    if (err) {
      try {
        await cleanup()
        logger.info('Limpeza de encerramento por travamento concluída com sucesso.')
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, 'Ocorreu um erro durante a limpeza de encerramento por travamento')
      }
      await crashShutdown(err)
    } else {
      logger.info({ signal }, `Recebido sinal ${signal ?? 'desconhecido'}. Iniciando graceful shutdown do worker...`)
      await cleanup()
      logger.info('Worker encerrado graciosamente.')
    }
  },
)

// Start
void bootstrap()
