export const QUEUE = {
  NAMES: {
    MAIL: 'mail-queue',
    MAINTENANCE: 'maintenance-queue',
    OUTBOX_DISPATCH: 'outbox-dispatch-queue',
  },
  JOBS: {
    OUTBOX_DISPATCH: 'outbox-dispatch',
    FIVE_MIN_SWEEP: 'five-min-sweep',
    MIDNIGHT_SCAN: 'midnight-scan',
    RETENTION_PURGE: 'retention-purge',
    ANALYTICS_RETENTION: 'analytics-retention',
    FAILED_JOBS_CLEANUP: 'failed-jobs-cleanup',
  },
  /**
   * Scheduler ids are the dedup key: every pod upserts the same id, so BullMQ
   * keeps one scheduler and emits one job per tick regardless of pod count.
   * Changing an id orphans the old scheduler in Redis — rename only alongside a
   * `removeJobScheduler` for the previous id.
   */
  SCHEDULER_IDS: {
    FIVE_MIN_SWEEP: 'maintenance:five-min-sweep',
    MIDNIGHT_SCAN: 'maintenance:midnight-scan',
    RETENTION_PURGE: 'maintenance:retention-purge',
    ANALYTICS_RETENTION: 'maintenance:analytics-retention',
    FAILED_JOBS_CLEANUP: 'maintenance:failed-jobs-cleanup',
  },
} as const
