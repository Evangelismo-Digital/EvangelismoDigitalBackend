import cron from 'node-cron'
import { OutboxProcessor } from './outbox-processor'
import { OutboxMaintenance } from './outbox-maintenance'
import { makeOutboxDispatchStrategyRegistry } from './make-outbox-dispatch-registry'
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
import { captureError } from '@lib/sentry/capture'
import { collectMetricsOutboxCronRuns } from '@lib/metrics/outbox-metrics'

export function startOutboxCron(existingProcessor?: OutboxProcessor, existingMaintenance?: OutboxMaintenance) {
  const processor = existingProcessor ?? buildProcessor()
  const maintenance = existingMaintenance ?? buildMaintenance()

  /**
   * Varredura de 5 minutos — latência de entrega e expiração.
   *
   * 1. sweepExpiredEvents — remove eventos com expiresAt vencido ANTES de
   *    processar pendentes, para que um PENDING recém-expirado seja deletado
   *    e não despachado (link morto nunca é enviado).
   * 2. processPendingEvents — eventos PENDING cujo OutboxSignal se perdeu
   *    esperam no máximo ~5 min em vez de até 24 h.
   */
  cron.schedule(CRON_SCHEDULES.EVERY_FIVE_MINUTES, async () => {
    collectMetricsOutboxCronRuns?.inc({ phase: 'five_min_sweep' })
    try {
      await maintenance.sweepExpiredEvents()
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.FIVE_MIN_SWEEP_EXPIRY_ERROR)
      captureError(error)
    }

    collectMetricsOutboxCronRuns?.inc({ phase: 'five_min_pending' })
    try {
      await processor.processPendingEvents()
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.FIVE_MIN_SWEEP_PENDING_ERROR)
      captureError(error)
    }
  })

  /**
   * Cron de meia-noite — varredura de segurança completa.
   *
   * Executa duas tarefas em sequência, cada uma com seu próprio lock:
   *
   * 1. processStuckSendingEvents — recupera eventos que travaram em SENDING
   *    após um crash entre o dispatch ao BullMQ e o delete do banco.
   *    Deve rodar ANTES de processPendingEvents para limpar o estado inconsistente
   *    antes de processar eventos novos.
   *
   * 2. processPendingEvents — processa eventos PENDING que não foram disparados
   *    via OutboxSignal (ex: worker estava fora do ar no momento da escrita).
   */
  cron.schedule(CRON_SCHEDULES.MIDNIGHT_DAILY, async () => {
    logger.info(OUTBOX_LOGS.CRON_START)

    // Fase 1: recupera eventos travados em SENDING
    collectMetricsOutboxCronRuns?.inc({ phase: 'midnight_recovery' })
    try {
      await processor.processStuckSendingEvents()
      logger.info(OUTBOX_LOGS.PHASE1_DONE)
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.PHASE1_ERROR)
      captureError(error, { phase: 1 })
    }

    // Fase 2: processa eventos PENDING não despachados
    collectMetricsOutboxCronRuns?.inc({ phase: 'midnight_pending' })
    try {
      await processor.processPendingEvents()
      logger.info(OUTBOX_LOGS.PHASE2_DONE)
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.PHASE2_ERROR)
      captureError(error, { phase: 2 })
    }

    logger.info(OUTBOX_LOGS.SCAN_DONE)
  })

  /**
   * Retenção diária (03:00, fora da janela da meia-noite) — remove eventos com
   * mais de RETENTION.DAYS dias, qualquer status, em lotes com lock renovado.
   */
  cron.schedule(CRON_SCHEDULES.DAILY_3AM, async () => {
    collectMetricsOutboxCronRuns?.inc({ phase: 'retention_purge' })
    try {
      await maintenance.purgeOldEvents()
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.RETENTION_CRON_ERROR)
      captureError(error)
    }
  })

  logger.info(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
}

function buildProcessor(): OutboxProcessor {
  return new OutboxProcessor(buildRepository(), makeOutboxDispatchStrategyRegistry())
}

function buildMaintenance(): OutboxMaintenance {
  return new OutboxMaintenance(buildRepository())
}

function buildRepository(): PrismaOutboxRepository {
  const dbContext = new DatabaseContext()
  const outboxHttpMapper = new PrismaErrorMapper(outboxHttpPrismaErrorMapping)
  const outboxInfraMapper = new PrismaErrorMapper(outboxInfraPrismaErrorMapping)
  return new PrismaOutboxRepository(dbContext, outboxHttpMapper, outboxInfraMapper)
}
