import { AnalyticsRepository } from 'core/contracts/repository/analytics-repository.interface'
import { Result, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { withDistributedLock } from '@lib/infra/distributed-lock/with-distributed-lock'
import {
  collectMetricsAnalyticsRetentionDeleted,
  collectMetricsAnalyticsRetentionRuns,
} from '@lib/metrics/analytics-metrics'
import { SECONDS_PER_DAY } from 'core/constants/time'
import { ANALYTICS_CONSTANTS, ANALYTICS_LOGS } from 'messages/constants/analytics/analytics'

const MS_PER_DAY = SECONDS_PER_DAY * 1000

type PurgeStep = (cutoff: Date, batchSize: number) => Promise<Result<number, AppError>>

interface RetentionTarget {
  table: string
  days: number
  purge: PurgeStep
}

/**
 * Daily deletion of analytics past its retention window (§5.3).
 *
 * Order matters: events, then sessions, then visitors. Deleting a visitor
 * cascades to its sessions and their events, so purging the leaves first keeps
 * each cascade small and predictable rather than having one visitor delete
 * remove hundreds of thousands of rows in a single statement.
 *
 * Written as a cron phase in the worker, mirroring `OutboxMaintenance`, rather
 * than as the BullMQ job the specification suggested: this repo already has a
 * scheduler with a distributed lock and batching, and a nightly DELETE does not
 * need a queue, a worker and a retry policy to go with it.
 */
export class AnalyticsRetention {
  private readonly LOCK_TTL_MS = ANALYTICS_CONSTANTS.LOCK_TTL_MS.DEFAULT

  constructor(private readonly analyticsRepository: AnalyticsRepository) {}

  async purgeExpiredData(): Promise<void> {
    await withDistributedLock({
      lockKey: ANALYTICS_CONSTANTS.LOCK_KEYS.ANALYTICS_RETENTION,
      ttlMs: this.LOCK_TTL_MS,
      errorMessage: ANALYTICS_LOGS.RETENTION_ERROR,
      work: async (renew) => {
        collectMetricsAnalyticsRetentionRuns?.inc()

        const deleted: Record<string, number> = {}

        for (const target of this.targets()) {
          deleted[target.table] = await this.purgeInBatches(target, renew)
        }

        logger.info({ deleted }, ANALYTICS_LOGS.RETENTION_DONE)
      },
    })
  }

  private targets(): RetentionTarget[] {
    return [
      {
        table: 'analytics_events',
        days: env.ANALYTICS_RETENTION_EVENTS_DAYS,
        purge: (cutoff, size) => this.analyticsRepository.purgeEventsOlderThan(cutoff, size),
      },
      {
        table: 'analytics_sessions',
        days: env.ANALYTICS_RETENTION_SESSIONS_DAYS,
        purge: (cutoff, size) => this.analyticsRepository.purgeSessionsOlderThan(cutoff, size),
      },
      {
        table: 'analytics_visitors',
        days: env.ANALYTICS_RETENTION_VISITORS_DAYS,
        purge: (cutoff, size) => this.analyticsRepository.purgeVisitorsInactiveSince(cutoff, size),
      },
    ]
  }

  /**
   * Loops one bounded batch at a time, renewing the lock between them, until a
   * pass deletes nothing or the per-run ceiling is reached.
   *
   * A repository failure ENDS this target and leaves the rest of the sweep to
   * run. Retention is not transactional and does not need to be: whatever was
   * not deleted tonight is deleted tomorrow, and aborting the whole sweep
   * because one table erred would let the other two grow unbounded.
   */
  private async purgeInBatches(target: RetentionTarget, renew: () => Promise<void>): Promise<number> {
    const cutoff = new Date(Date.now() - target.days * MS_PER_DAY)
    let totalDeleted = 0

    for (let batch = 0; batch < ANALYTICS_CONSTANTS.RETENTION.MAX_BATCHES_PER_RUN; batch++) {
      const deleted = await this.purgeOneBatch(target, cutoff)

      // A single exit: zero means "nothing left, or this table just failed", and
      // both call for the same thing — stop here and let the next table run.
      if (deleted === 0) {
        break
      }

      totalDeleted += deleted
      collectMetricsAnalyticsRetentionDeleted?.inc({ table: target.table }, deleted)

      await renew()
    }

    return totalDeleted
  }

  /**
   * One batch, reporting a failure as zero deletions.
   *
   * Collapsing "errored" into "nothing more to do" is deliberate: retention is
   * not transactional, and the correct response to either is to move on. What
   * must NOT be collapsed is the logging — a failure is recorded with the table
   * that produced it, so a table that quietly stops draining is visible.
   */
  private async purgeOneBatch(target: RetentionTarget, cutoff: Date): Promise<number> {
    const result = await target.purge(cutoff, ANALYTICS_CONSTANTS.RETENTION.BATCH_SIZE)

    if (isErr(result)) {
      logger.error({ error: result.error, table: target.table }, ANALYTICS_LOGS.RETENTION_ERROR)

      return 0
    }

    return result.value
  }
}
