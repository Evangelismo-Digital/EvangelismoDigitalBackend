import cron from 'node-cron'
import { OutboxProcessor } from './outbox-processor'
import { logger } from '@lib/logger'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import {
  outboxHttpPrismaErrorMapping,
  outboxInfraPrismaErrorMapping,
} from '@repositories/prisma/errors/outbox-error-mapping'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { CRON_SCHEDULES } from 'messages/constants/cron/cron'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'

export function startOutboxCron(existingProcessor?: OutboxProcessor) {
  /**
   * Cron de meia-noite — varredura de segurança completa.
   *
   * Executa duas tarefas em sequência, cada uma com seu próprio lock:
   *
   * 1. recoverStuckSendingEvents — recupera eventos que travaram em SENDING
   *    após um crash entre o dispatch ao BullMQ e o delete do banco.
   *    Deve rodar ANTES de processEvents para limpar o estado inconsistente
   *    antes de processar eventos novos.
   *
   * 2. processEvents — processa eventos PENDING que não foram disparados
   *    via OutboxSignal (ex: worker estava fora do ar no momento da escrita).
   */
  cron.schedule(CRON_SCHEDULES.MIDNIGHT_DAILY, async () => {
    logger.info(OUTBOX_LOGS.CRON_START)

    const processor = existingProcessor ?? buildProcessor()

    // Fase 1: recupera eventos travados em SENDING
    try {
      await processor.recoverStuckSendingEvents()
      logger.info(OUTBOX_LOGS.PHASE1_DONE)
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.PHASE1_ERROR)
    }

    // Fase 2: processa eventos PENDING não despachados
    try {
      await processor.processEvents()
      logger.info(OUTBOX_LOGS.PHASE2_DONE)
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.PHASE2_ERROR)
    }

    logger.info(OUTBOX_LOGS.SCAN_DONE)
  })

  logger.info(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
}

function buildProcessor(): OutboxProcessor {
  const dbContext = new DatabaseContext()
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)
  return new OutboxProcessor(outboxRepository)
}
