export const LOCK_KEYS = {
  OUTBOX_PROCESSOR: 'lock:outbox-processor',
  OUTBOX_RECOVERY: 'lock:outbox-recovery',
} as const

export const LOCK_TTL_MS = {
  DEFAULT: 10_000,
} as const
