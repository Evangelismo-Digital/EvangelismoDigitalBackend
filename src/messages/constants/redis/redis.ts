export const REDIS_CONSTANTS = {
  CHANNELS: {
    OUTBOX_SIGNAL: 'outbox-signal',
  },
  KEYS: {
    IDEMPOTENCY_EMAIL_PREFIX: 'idempotency:email:',
    RATE_LIMIT_PREFIX: 'ratelimit:v1:',
  },
} as const
