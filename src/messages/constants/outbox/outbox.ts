export const OUTBOX_CONSTANTS = {
  LOCK_KEYS: {
    OUTBOX_PROCESSOR: 'lock:outbox-processor',
    OUTBOX_RECOVERY: 'lock:outbox-recovery',
    OUTBOX_EXPIRY_SWEEP: 'lock:outbox-expiry-sweep',
    OUTBOX_RETENTION: 'lock:outbox-retention',
  },
  LOCK_TTL_MS: {
    DEFAULT: 10_000,
  },
  THRESHOLDS: {
    /**
     * Time in ms after which a SENDING event is considered stuck (e.g., after a crash).
     * Must exceed the worst-case BullMQ job lifetime (3 attempts x lockDuration + exponential
     * backoff), otherwise recovery could re-dispatch a job that is still being retried.
     */
    STUCK_SENDING_MS: 900_000,
    /** Maximum number of pending events fetched per processing cycle */
    PENDING_FETCH_LIMIT: 50,
    /** Maximum number of stuck SENDING events fetched per recovery cycle */
    STUCK_FETCH_LIMIT: 50,
    /**
     * Maximum dispatch cycles (PENDING -> SENDING transitions) before an event is
     * marked FAILED (terminal). Prevents poison messages from looping forever.
     */
    MAX_DISPATCH_ATTEMPTS: 5,
  },
  RETENTION: {
    /** Eventos com mais de N dias são removidos pela retenção diária, qualquer status. */
    DAYS: 14,
    /** Um lote por chamada, para renovar o lock distribuído entre lotes. */
    BATCH_SIZE: 1000,
  },
} as const
