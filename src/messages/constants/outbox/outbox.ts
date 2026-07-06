export const OUTBOX_CONSTANTS = {
  LOCK_KEYS: {
    OUTBOX_PROCESSOR: 'lock:outbox-processor',
    OUTBOX_RECOVERY: 'lock:outbox-recovery',
  },
  LOCK_TTL_MS: {
    DEFAULT: 10_000,
  },
  THRESHOLDS: {
    /** Time in ms after which a SENDING event is considered stuck (e.g., after a crash) */
    STUCK_SENDING_MS: 30_000,
    /** Maximum number of pending events fetched per processing cycle */
    PENDING_FETCH_LIMIT: 50,
  },
} as const
