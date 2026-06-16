import cron from 'node-cron'
import { OutboxProcessor } from './outbox-processor'
import { logger } from '@lib/logger'
import { PrismaOutboxRepository } from '@repositories/prisma/prisma-outbox-event-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { outboxHttpPrismaErrorMapping, outboxInfraPrismaErrorMapping } from '@repositories/prisma/errors/outbox-error-mapping'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { CRON_SCHEDULES } from 'core/constants/cron/cron'

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
    logger.info('⏰ Cron de meia-noite: iniciando varredura de segurança da Outbox...')

    const processor = existingProcessor ?? buildProcessor()

    // Fase 1: recupera eventos travados em SENDING
    try {
      await processor.recoverStuckSendingEvents()
      logger.info('✅ Fase 1 (recuperação SENDING): concluída.')
    } catch (error) {
      logger.error({ error }, '❌ Fase 1 (recuperação SENDING): erro inesperado.')
    }

    // Fase 2: processa eventos PENDING não despachados
    try {
      await processor.processEvents()
      logger.info('✅ Fase 2 (eventos PENDING): concluída.')
    } catch (error) {
      logger.error({ error }, '❌ Fase 2 (eventos PENDING): erro inesperado.')
    }

    logger.info('✅ Varredura de segurança da Outbox concluída.')
  })

  logger.info('🗓️ Agendador da Outbox configurado para 00:00 diariamente.')
}

function buildProcessor(): OutboxProcessor {
  const dbContext = new DatabaseContext()
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
  const outboxRepository = new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)
  return new OutboxProcessor(outboxRepository)
}
