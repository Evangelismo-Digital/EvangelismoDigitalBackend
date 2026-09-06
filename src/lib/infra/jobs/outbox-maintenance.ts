import { OUTBOX_CONSTANTS } from 'messages/constants/outbox/outbox'
import { logger } from '@lib/logger'
import { DistributedLock, LockToken } from '@lib/infra/distributed-lock/distributed-lock'
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

  constructor(private outboxRepository: IOutboxRepository) {}

  async sweepExpiredEvents(): Promise<void> {
    await this.withLock(
      OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_EXPIRY_SWEEP,
      OUTBOX_LOGS.EXPIRY_SWEEP_ERROR,
      async (renew) => {
        const totalDeleted = await this.deleteExpiredInBatches(new Date(), renew)

        if (totalDeleted > 0) {
          collectMetricsOutboxMaintenanceDeleted?.inc({ operation: 'expiry_sweep' }, totalDeleted)
          logger.info({ deleted: totalDeleted }, OUTBOX_LOGS.EXPIRY_SWEEP_DELETED)
        }
      },
    )
  }

  async purgeOldEvents(): Promise<void> {
    await this.withLock(OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RETENTION, OUTBOX_LOGS.RETENTION_ERROR, async (renew) => {
      const cutoff = new Date(Date.now() - OUTBOX_CONSTANTS.RETENTION.DAYS * 24 * 60 * 60 * 1000)
      const { totalDeleted, totalByStatus } = await this.deleteOlderThanInBatches(cutoff, renew)

      if (totalDeleted > 0) {
        collectMetricsOutboxMaintenanceDeleted?.inc({ operation: 'retention_purge' }, totalDeleted)
        reportPurge(totalDeleted, totalByStatus)
      }
    })
  }

  /**
   * Roda `run` sob o lock distribuído, ou não roda nada se outra instância já o
   * detém. `renew` é passado adiante para que um lote longo possa estender o
   * TTL — tabelas grandes após um incidente não podem estourar o lock.
   */
  private async withLock(
    lockKey: string,
    errorMessage: string,
    run: (renew: () => Promise<void>) => Promise<void>,
  ): Promise<void> {
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(lockKey, this.LOCK_TTL_MS)

      if (!lockToken) return

      const token = lockToken

      await run(async () => {
        // `renew` reports whether the lock was still ours; the batch loops do
        // not branch on it, so the boolean is deliberately discarded here.
        await DistributedLock.renew(lockKey, token, this.LOCK_TTL_MS)
      })
    } catch (error) {
      logger.error({ error }, errorMessage)
      captureError(error)
    } finally {
      if (lockToken) {
        await DistributedLock.release(lockKey, lockToken)
      }
    }
  }

  /** Um lote por iteração, renovando o lock entre lotes. */
  private async deleteExpiredInBatches(now: Date, renew: () => Promise<void>): Promise<number> {
    let totalDeleted = 0

    for (;;) {
      await renew()

      const result = await this.outboxRepository.deleteExpired(now, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE)

      if (isErr(result)) {
        logger.error({ error: result.error }, OUTBOX_LOGS.EXPIRY_SWEEP_ERROR)
        captureError(result.error)
        break
      }

      totalDeleted += result.value

      if (result.value < OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) break
    }

    return totalDeleted
  }

  private async deleteOlderThanInBatches(
    cutoff: Date,
    renew: () => Promise<void>,
  ): Promise<{ totalDeleted: number; totalByStatus: Partial<Record<IOutboxEventStatus, number>> }> {
    let totalDeleted = 0
    const totalByStatus: Partial<Record<IOutboxEventStatus, number>> = {}

    for (;;) {
      await renew()

      const batchResult = await this.outboxRepository.deleteOlderThan(cutoff, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE)

      if (isErr(batchResult)) {
        logger.error({ error: batchResult.error }, OUTBOX_LOGS.RETENTION_ERROR)
        captureError(batchResult.error)
        break
      }

      const { deleted, byStatus } = batchResult.value
      totalDeleted += deleted

      for (const [status, count] of Object.entries(byStatus) as [IOutboxEventStatus, number][]) {
        totalByStatus[status] = (totalByStatus[status] ?? 0) + count
      }

      if (deleted < OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) break
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
