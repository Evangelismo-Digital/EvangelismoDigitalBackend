import { OUTBOX_CONSTANTS } from 'messages/constants/outbox/outbox'
import { logger } from '@lib/logger'
import { withDistributedLock } from '@lib/infra/distributed-lock/with-distributed-lock'
import { isErr } from 'core/shared/result'
import { IOutboxRepository, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { captureError } from '@lib/sentry/capture'
import { collectMetricsOutboxMaintenanceDeleted } from '@lib/metrics/outbox-metrics'

/**
 * Varreduras de limpeza da Outbox — propósito diferente da máquina de estados
 * de despacho (OutboxProcessor): aqui só se DELETA, nunca se despacha.
 *
 * - sweepExpiredEvents (5 min): remove eventos com expiresAt vencido. Com a
 *   janela de 15 min do token de reset, um payload expirado (que carrega o
 *   token cru) vive no máximo ~5 min além da expiração.
 * - purgeOldEvents (diária): remove eventos com mais de RETENTION.DAYS dias,
 *   com qualquer status.
 */
export class OutboxMaintenance {
  private readonly LOCK_TTL_MS = OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT

  constructor(private readonly outboxRepository: IOutboxRepository) {}

  async sweepExpiredEvents(): Promise<void> {
    await withDistributedLock({
      lockKey: OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_EXPIRY_SWEEP,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.EXPIRY_SWEEP_ERROR,
      work: async (renew) => {
        const totalDeleted = await this.deleteExpiredInBatches(new Date(), renew)

        if (totalDeleted > 0) {
          collectMetricsOutboxMaintenanceDeleted?.inc({ operation: 'expiry_sweep' }, totalDeleted)
          logger.info({ deleted: totalDeleted }, OUTBOX_LOGS.EXPIRY_SWEEP_DELETED)
        }
      },
    })
  }

  async purgeOldEvents(): Promise<void> {
    await withDistributedLock({
      lockKey: OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RETENTION,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: OUTBOX_LOGS.RETENTION_ERROR,
      work: async (renew) => {
        const cutoff = new Date(Date.now() - OUTBOX_CONSTANTS.RETENTION.DAYS * 24 * 60 * 60 * 1000)
        const { totalDeleted, totalByStatus } = await this.deleteOlderThanInBatches(cutoff, renew)

        if (totalDeleted > 0) {
          collectMetricsOutboxMaintenanceDeleted?.inc({ operation: 'retention_purge' }, totalDeleted)
          reportPurge(totalDeleted, totalByStatus)
        }
      },
    })
  }

  /** Um lote por iteração, renovando o lock entre lotes. */
  private async deleteExpiredInBatches(now: Date, renew: () => Promise<void>): Promise<number> {
    let totalDeleted = 0
    // A short batch means the table is drained; the loop condition says so
    // directly instead of through two `break`s buried in the body.
    let lastBatchSize: number = OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE

    while (lastBatchSize === OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) {
      await renew()

      const result = await this.outboxRepository.deleteExpired(now, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE)

      if (isErr(result)) {
        logger.error({ error: result.error }, OUTBOX_LOGS.EXPIRY_SWEEP_ERROR)
        captureError(result.error)
        return totalDeleted
      }

      lastBatchSize = result.value
      totalDeleted += lastBatchSize
    }

    return totalDeleted
  }

  private async deleteOlderThanInBatches(
    cutoff: Date,
    renew: () => Promise<void>,
  ): Promise<{ totalDeleted: number; totalByStatus: Partial<Record<IOutboxEventStatus, number>> }> {
    let totalDeleted = 0
    const totalByStatus: Partial<Record<IOutboxEventStatus, number>> = {}

    // Same shape as deleteExpiredInBatches: the loop condition carries the
    // "table is drained" rule, and an error leaves through a single return.
    let lastBatchSize: number = OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE

    while (lastBatchSize === OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) {
      await renew()

      const batchResult = await this.outboxRepository.deleteOlderThan(cutoff, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE)

      if (isErr(batchResult)) {
        logger.error({ error: batchResult.error }, OUTBOX_LOGS.RETENTION_ERROR)
        captureError(batchResult.error)
        return { totalDeleted, totalByStatus }
      }

      const { deleted, byStatus } = batchResult.value
      lastBatchSize = deleted
      totalDeleted += deleted

      for (const [status, count] of Object.entries(byStatus) as [IOutboxEventStatus, number][]) {
        totalByStatus[status] = (totalByStatus[status] ?? 0) + count
      }
    }

    return { totalDeleted, totalByStatus }
  }
}

/**
 * PENDING/SENDING com 14+ dias é lixo inalcançável (o cap de attempts teria
 * transicionado para FAILED) — mas merece investigação, então sobe a warn.
 */
function reportPurge(totalDeleted: number, totalByStatus: Partial<Record<IOutboxEventStatus, number>>): void {
  const nonTerminal =
    (totalByStatus[IOutboxEventStatus.PENDING] ?? 0) + (totalByStatus[IOutboxEventStatus.SENDING] ?? 0)

  if (nonTerminal > 0) {
    logger.warn({ deleted: totalDeleted, byStatus: totalByStatus }, OUTBOX_LOGS.RETENTION_PURGED_NON_TERMINAL)
    return
  }

  logger.info({ deleted: totalDeleted, byStatus: totalByStatus }, OUTBOX_LOGS.RETENTION_PURGED)
}
