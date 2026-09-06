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

  scheduleFiveMinuteSweep(processor, maintenance)
  scheduleMidnightScan(processor)
  scheduleRetentionPurge(maintenance)

  logger.info(OUTBOX_LOGS.SCHEDULER_CONFIGURED)
}

/**
 * Uma fase do cron: conta a execução, roda a tarefa e nunca deixa um erro
 * escapar — uma fase que falha não pode impedir a próxima de rodar.
 */
async function runPhase(
  phase: string,
  task: () => Promise<void>,
  errorMessage: string,
  options: { onSuccess?: string; sentryContext?: Record<string, unknown> } = {},
): Promise<void> {
  collectMetricsOutboxCronRuns?.inc({ phase })

  try {
    await task()

    if (options.onSuccess) {
      logger.info(options.onSuccess)
    }
  } catch (error) {
    logger.error({ error }, errorMessage)

    // Called with one argument when there is no context: `captureError(error,
    // undefined)` is a different call, and the specs assert the arity.
    if (options.sentryContext) {
      captureError(error, options.sentryContext)
    } else {
      captureError(error)
    }
  }
}

/**
 * Varredura de 5 minutos — latência de entrega e expiração.
 *
 * 1. sweepExpiredEvents — remove eventos com expiresAt vencido ANTES de
 *    processar pendentes, para que um PENDING recém-expirado seja deletado
 *    e não despachado (link morto nunca é enviado).
 * 2. processPendingEvents — eventos PENDING cujo OutboxSignal se perdeu
 *    esperam no máximo ~5 min em vez de até 24 h.
 */
function scheduleFiveMinuteSweep(processor: OutboxProcessor, maintenance: OutboxMaintenance) {
  cron.schedule(CRON_SCHEDULES.EVERY_FIVE_MINUTES, async () => {
    await runPhase('five_min_sweep', () => maintenance.sweepExpiredEvents(), OUTBOX_LOGS.FIVE_MIN_SWEEP_EXPIRY_ERROR)
    await runPhase('five_min_pending', () => processor.processPendingEvents(), OUTBOX_LOGS.FIVE_MIN_SWEEP_PENDING_ERROR)
  })
}

/**
 * Cron de meia-noite — varredura de segurança completa, duas tarefas em
 * sequência, cada uma com seu próprio lock:
 *
 * 1. processStuckSendingEvents — recupera eventos que travaram em SENDING após
 *    um crash entre o dispatch ao BullMQ e o delete do banco. Roda ANTES de
 *    processPendingEvents para limpar o estado inconsistente antes de
 *    processar eventos novos.
 * 2. processPendingEvents — processa eventos PENDING que não foram disparados
 *    via OutboxSignal (ex.: worker fora do ar no momento da escrita).
 */
function scheduleMidnightScan(processor: OutboxProcessor) {
  cron.schedule(CRON_SCHEDULES.MIDNIGHT_DAILY, async () => {
    logger.info(OUTBOX_LOGS.CRON_START)

    await runPhase('midnight_recovery', () => processor.processStuckSendingEvents(), OUTBOX_LOGS.PHASE1_ERROR, {
      onSuccess: OUTBOX_LOGS.PHASE1_DONE,
      sentryContext: { phase: 1 },
    })

    await runPhase('midnight_pending', () => processor.processPendingEvents(), OUTBOX_LOGS.PHASE2_ERROR, {
      onSuccess: OUTBOX_LOGS.PHASE2_DONE,
      sentryContext: { phase: 2 },
    })

    logger.info(OUTBOX_LOGS.SCAN_DONE)
  })
}

/**
 * Retenção diária (03:00, fora da janela da meia-noite) — remove eventos com
 * mais de RETENTION.DAYS dias, qualquer status, em lotes com lock renovado.
 */
function scheduleRetentionPurge(maintenance: OutboxMaintenance) {
  cron.schedule(CRON_SCHEDULES.DAILY_3AM, async () => {
    await runPhase('retention_purge', () => maintenance.purgeOldEvents(), OUTBOX_LOGS.RETENTION_CRON_ERROR)
  })
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
