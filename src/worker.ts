import { initSentry } from '@lib/sentry/init'

// Initialize Sentry at process startup
initSentry()

import { startOutboxCron } from '@lib/infra/jobs/outbox-cron'
import { OutboxProcessor } from '@lib/infra/jobs/outbox-processor'
import { logger } from '@lib/logger'
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
