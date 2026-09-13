import { initSentry } from '@lib/sentry/init'

// Initialize Sentry at process startup
initSentry()

import { startOutboxCron } from '@lib/infra/jobs/outbox-cron'
import { OutboxProcessor } from '@lib/infra/jobs/outbox-processor'
import { OutboxMaintenance } from '@lib/infra/jobs/outbox-maintenance'
import { AnalyticsRetention } from '@lib/infra/jobs/analytics-retention'
import { PrismaAnalyticsRepository } from '@repositories/prisma/prisma-analytics-repository'
import { makeOutboxDispatchStrategyRegistry } from '@lib/infra/jobs/make-outbox-dispatch-registry'
import { logger } from '@lib/logger'
import { captureError } from '@lib/sentry/capture'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { closeAllRedisConnections } from '@lib/redis/clients/clients'
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
import closeWithGrace from 'close-with-grace'
import { env } from '@env/index'
import { getMailQueue } from '@lib/queue/mail-queue'
import { registerQueue, unregisterQueue } from '@lib/metrics/bullmq-metrics'
import { QUEUE } from 'messages/constants/queue/queue'
import { startMetricsServer, stopMetricsServer } from './metrics-server'

let worker: Worker | null = null

async function bootstrap() {
  try {
    logger.info('Inicializando serviços de background...')

    const dbContext = new DatabaseContext()
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

    worker = startMailWorker(outboxRepository)
    logger.info('Mail worker iniciado')

    // Register the producer queue so /metrics can report its job counts on scrape.
    registerQueue(QUEUE.NAMES.MAIL, getMailQueue())

    const outboxProcessor = new OutboxProcessor(outboxRepository, makeOutboxDispatchStrategyRegistry())

    await OutboxSignal.subscribe(async (_publicId: string, event: IOutboxEvent) => {
      await outboxProcessor.processSingleEvent(event)
    })

    // ============================================================================
    // NOTA: [ALERTA DE ESCALABILIDADE HORIZONTAL]
    // Limitação conhecida e aceita da topologia atual (um único worker), não uma
    // tarefa pendente — o dia em que houver um segundo pod, comece por aqui.
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
    const analyticsRetention = new AnalyticsRetention(new PrismaAnalyticsRepository())
    startOutboxCron(outboxProcessor, outboxMaintenance, analyticsRetention)

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
      OutboxSignal.disconnect()
      logger.info('OutboxSignal desconectado')
      await Promise.resolve()
    },
    async () => {
      if (worker) {
        await worker.close()
        logger.info('Worker finalizado')
      }
    },
    async () => {
      unregisterQueue(QUEUE.NAMES.MAIL)
      await getMailQueue().close()
      logger.info('MailQueue finalizada')
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
