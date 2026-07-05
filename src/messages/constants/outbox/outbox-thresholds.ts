export const OUTBOX_THRESHOLDS = {
  /** Time in ms after which a SENDING event is considered stuck (e.g., after a crash) */
  STUCK_SENDING_MS: 30_000,
  /** Maximum number of pending events fetched per processing cycle */
  PENDING_FETCH_LIMIT: 50,
} as const
