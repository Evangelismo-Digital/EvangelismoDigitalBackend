export const WORKER_CONSTANTS = {
  MAIL: {
    CONCURRENCY_LIMIT: 5,
    LOCK_DURATION_MS: 60_000,
    STALLED_INTERVAL_MS: 30_000,
    REMOVE_ON_COMPLETE: {
      age: 3600,
      count: 1000,
    },
    REMOVE_ON_FAIL: {
      age: 604800,
      count: 2000,
    },
  },
  OUTBOX_DISPATCH: {
    CONCURRENCY_LIMIT: 5,
    LOCK_DURATION_MS: 30_000,
    STALLED_INTERVAL_MS: 30_000,
  },
  /**
   * Concorrência 1: as varreduras de manutenção são pesadas no banco e já se
   * excluem via DistributedLock. Deixar duas rodarem juntas só trocaria o lock
   * por espera, sem ganho — e a fila nunca tem mais que quatro jobs por hora.
   */
  MAINTENANCE: {
    CONCURRENCY_LIMIT: 1,
  },
  QUEUE: {
    JOB_ATTEMPTS: 3,
    BACKOFF_TYPE: 'exponential' as const,
    BACKOFF_DELAY_MS: 10_000,
    BACKOFF_JITTER: 0.3,
  },
  IDEMPOTENCY_TTL: {
    PROCESSING_SECONDS: 300,
    COMPLETED_SECONDS: 86_400,
  },
} as const
