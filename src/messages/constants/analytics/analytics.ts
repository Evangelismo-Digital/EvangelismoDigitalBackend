export const ANALYTICS_CONSTANTS = {
  LOCK_KEYS: {
    ANALYTICS_RETENTION: 'lock:analytics-retention',
  },
  LOCK_TTL_MS: {
    DEFAULT: 10_000,
  },
  RETENTION: {
    /**
     * One batch per statement, with the lock renewed between batches.
     *
     * A `DELETE` without a bound would take one lock over months of backlog and
     * hold the table for the length of it. The sweep loops until a pass deletes
     * nothing, so a large backlog drains over several passes instead of one long
     * outage.
     */
    BATCH_SIZE: 1_000,
    /** Ceiling on batches per run, so one night's sweep cannot run unbounded. */
    MAX_BATCHES_PER_RUN: 100,
  },
} as const

export const ANALYTICS_LOGS = {
  RETENTION_ERROR: 'Falha na varredura de retenção de analytics',
  RETENTION_DONE: 'Varredura de retenção de analytics concluída',
} as const
