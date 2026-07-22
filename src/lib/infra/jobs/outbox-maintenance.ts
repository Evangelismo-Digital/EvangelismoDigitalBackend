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
    const lockKey = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_EXPIRY_SWEEP
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(lockKey, this.LOCK_TTL_MS)
      if (!lockToken) return

      const now = new Date()
      let totalDeleted = 0

      // Um lote por iteração, renovando o lock entre lotes — mesma defesa de
      // deleteOlderThan caso a varredura de 5 min fique parada por muito tempo.
      for (;;) {
        await DistributedLock.renew(lockKey, lockToken, this.LOCK_TTL_MS)

        const result = await this.outboxRepository.deleteExpired(now, OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE)

        if (isErr(result)) {
          logger.error({ error: result.error }, OUTBOX_LOGS.EXPIRY_SWEEP_ERROR)
          captureError(result.error)
          break
        }

        totalDeleted += result.value
        if (result.value < OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE) break
      }

      if (totalDeleted > 0) {
        collectMetricsOutboxMaintenanceDeleted?.inc({ operation: 'expiry_sweep' }, totalDeleted)
        logger.info({ deleted: totalDeleted }, OUTBOX_LOGS.EXPIRY_SWEEP_DELETED)
      }
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.EXPIRY_SWEEP_ERROR)
      captureError(error)
    } finally {
      if (lockToken) {
        await DistributedLock.release(lockKey, lockToken)
      }
    }
  }

  async purgeOldEvents(): Promise<void> {
    const lockKey = OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RETENTION
    let lockToken: LockToken | null = null

    try {
      lockToken = await DistributedLock.acquire(lockKey, this.LOCK_TTL_MS)
      if (!lockToken) return

      const cutoff = new Date(Date.now() - OUTBOX_CONSTANTS.RETENTION.DAYS * 24 * 60 * 60 * 1000)

      let totalDeleted = 0
      const totalByStatus: Partial<Record<IOutboxEventStatus, number>> = {}

      // Um lote por iteração, renovando o lock entre lotes (tabelas grandes
      // após um incidente não podem estourar o TTL do lock)
      for (;;) {
        await DistributedLock.renew(lockKey, lockToken, this.LOCK_TTL_MS)

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

      if (totalDeleted > 0) {
        collectMetricsOutboxMaintenanceDeleted?.inc({ operation: 'retention_purge' }, totalDeleted)

        const nonTerminal =
          (totalByStatus[IOutboxEventStatus.PENDING] ?? 0) + (totalByStatus[IOutboxEventStatus.SENDING] ?? 0)

        if (nonTerminal > 0) {
          // PENDING/SENDING com 14+ dias é lixo inalcançável (o cap de attempts
          // teria transicionado para FAILED) — mas merece investigação
          logger.warn({ deleted: totalDeleted, byStatus: totalByStatus }, OUTBOX_LOGS.RETENTION_PURGED_NON_TERMINAL)
        } else {
          logger.info({ deleted: totalDeleted, byStatus: totalByStatus }, OUTBOX_LOGS.RETENTION_PURGED)
        }
      }
    } catch (error) {
      logger.error({ error }, OUTBOX_LOGS.RETENTION_ERROR)
      captureError(error)
    } finally {
      if (lockToken) {
        await DistributedLock.release(lockKey, lockToken)
      }
    }
  }
}
