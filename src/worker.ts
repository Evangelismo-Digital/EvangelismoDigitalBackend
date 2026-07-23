import { initSentry } from '@lib/sentry/init'

// Initialize Sentry at process startup
initSentry()

import { startOutboxCron } from '@lib/infra/jobs/outbox-cron'
import { OutboxProcessor } from '@lib/infra/jobs/outbox-processor'
import { OutboxMaintenance } from '@lib/infra/jobs/outbox-maintenance'
import { makeOutboxDispatchStrategyRegistry } from '@lib/infra/jobs/make-outbox-dispatch-registry'
import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { startMailWorker } from '@lib/workers/mail-worker'
import { OutboxSignal } from '@lib/infra/events/outbox-signal'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@repositories/prisma/errors/outbox-error-mapping'
import { Worker } from 'bullmq'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { crashShutdown } from '@lib/shutdown/crash-shutdown'
import { env } from '@env/index'
import { getMailQueue } from '@lib/queue/mail-queue'
import { registerQueue, unregisterQueue } from '@lib/metrics/bullmq-metrics'
import { QUEUE } from 'messages/constants/queue/queue'
import { startMetricsServer, stopMetricsServer } from './metrics-server'

let worker: Worker | null = null
let shuttingDown = false

async function bootstrap() {
  try {
    logger.info('Inicializando serviços de background...')

    const dbContext = new DatabaseContext()
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

    worker = await startMailWorker(outboxRepository)
    logger.info('Mail worker iniciado')

    // Register the producer queue so /metrics can report its job counts on scrape.
    registerQueue(QUEUE.NAMES.MAIL, getMailQueue())

    const outboxProcessor = new OutboxProcessor(outboxRepository, makeOutboxDispatchStrategyRegistry())

    await OutboxSignal.subscribe(async (publicId: string, event: IOutboxEvent) => {
      await outboxProcessor.processSingleEvent(event)
    })

    // ============================================================================
    // @TODO: [ALERTA DE ESCALABILIDADE HORIZONTAL]
    // Se a infraestrutura for escalada para mais de um worker/pod, TODOS os pods
    // rodarão este cron simultaneamente. Embora a classe OutboxProcessor já utilize
    // um DistributedLock para evitar processamento duplicado, ter múltiplos crons
    // competindo pelo mesmo lock gera overhead e contenção no Redis/DB.
    //
    // SUGESTÃO DE ARQUITETURA:
    // Implementar um sistema de "Leader Election" (Eleição de Líder).
    // Antes de rodar a rotina do cron, os workers disputam uma chave no Redis
    // (ex: usando SETNX com TTL de 1 minuto). O worker que conseguir o lock atua
    // como "Líder" e executa a varredura, enquanto os outros ficam em standby.
    //
    // O mesmo alerta vale para o handler de Pub/Sub acima (OutboxSignal.subscribe):
    // o Redis entrega o sinal a TODOS os assinantes, então N pods processariam o
    // mesmo evento concorrentemente. Hoje a segurança vem do jobId determinístico
    // no BullMQ (dedup) e do updateStatus idempotente — não de um lock.
    // ============================================================================
    const outboxMaintenance = new OutboxMaintenance(outboxRepository)
    startOutboxCron(outboxProcessor, outboxMaintenance)

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
    await crashShutdown(error, cleanup)
  }
}

// Cleanup resources
async function cleanup() {
  try {
    await OutboxSignal.disconnect()
    logger.info('OutboxSignal desconectado com sucesso')
  } catch (err) {
    logger.error(err, 'Erro ao desconectar o OutboxSignal')
  }

  if (worker) {
    try {
      await worker.close()
      logger.info('Worker finalizado com sucesso')
    } catch (err) {
      logger.error(err, 'Erro ao finalizar o worker')
    }
  }

  // Stop reporting the mail queue and close its producer connection.
  try {
    unregisterQueue(QUEUE.NAMES.MAIL)
    await getMailQueue().close()
    logger.info('MailQueue finalizada com sucesso')
  } catch (err) {
    logger.error(err, 'Erro ao finalizar a MailQueue')
  }

  // Metrics server closes LAST so telemetry stays scrapeable through shutdown.
  try {
    await stopMetricsServer()
  } catch (err) {
    logger.error(err, 'Erro ao finalizar o servidor de métricas do worker')
  }
}

// Expected/Graceful Signal Shutdown (exit code 0)
async function gracefulShutdown(signal: string) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true
  logger.info(`Recebido sinal ${signal}. Iniciando graceful shutdown do worker...`)
  await cleanup()
  process.exit(0)
}

// Signal handling
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'))

// Process-level error handling
process.on('unhandledRejection', (reason) => {
  crashShutdown(reason, cleanup)
})

process.on('uncaughtException', (error) => {
  crashShutdown(error, cleanup)
})

// Start
bootstrap()
