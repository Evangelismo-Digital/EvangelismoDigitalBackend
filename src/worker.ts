import { startOutboxCron } from '@lib/infra/jobs/outbox-cron'
import { OutboxProcessor } from '@lib/infra/jobs/outbox-processor'
import { logger } from '@lib/logger'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { startMailWorker } from '@lib/workers/mail-worker'
import { OutboxSignal } from '@lib/infra/events/outbox-signal'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { outboxHttpPrismaErrorMapping, outboxInfraPrismaErrorMapping } from '@repositories/prisma/errors/outbox-error-mapping'
import { Worker } from 'bullmq'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'

let worker: Worker | null = null
let shuttingDown = false

async function bootstrap() {
  try {
    logger.info('🔧 Inicializando serviços de background...')

    const dbContext = new DatabaseContext()
    const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
    const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
    const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)

    worker = await startMailWorker(outboxRepository)
    logger.info('✅ Mail worker iniciado')

    const outboxProcessor = new OutboxProcessor(outboxRepository)

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
    // ============================================================================
    startOutboxCron(outboxProcessor)
  } catch (error) {
    logger.fatal({ error }, '🔥 Erro fatal ao iniciar os workers')
    process.exit(1)
  }
}

// Graceful Shutdown
async function shutdown(signal: string, exitCode: number = 0) {
  if (shuttingDown) {
    return
  }

  shuttingDown = true

  logger.info(`Recebido sinal ${signal}. Iniciando shutdown do worker...`)

  // Desconecta o OutboxSignal (publisher + subscriber) antes de tudo
  try {
    await OutboxSignal.disconnect()
    logger.info('OutboxSignal desconectado com sucesso')
  } catch (err) {
    logger.error(err, 'Erro ao desconectar o OutboxSignal')
    exitCode = 1
  }

  if (worker) {
    try {
      // Fecha o worker do BullMQ graciosamente (espera jobs ativos terminarem)
      await worker.close()
      logger.info('Worker finalizado com sucesso')
    } catch (err) {
      logger.error(err, 'Erro ao finalizar o worker')
      exitCode = 1
    }
  }

  // O Cron (node-cron) é parado automaticamente quando o processo morre via process.exit
  process.exit(exitCode)
}

// Signal handling
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGUSR2', () => shutdown('SIGUSR2'))

// Process-level error handling
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection')
})

process.on('uncaughtException', async (error: unknown) => {
  logger.fatal({ error }, 'Uncaught Exception thrown')
  await shutdown('UNCAUGHT_EXCEPTION', 1)
})

// Start
bootstrap()
