export const REDIS_LOGS = {
  BULLMQ_UNEXPECTED_ERROR: 'Unexpected Redis BullMQ connection error',
  CACHE_UNEXPECTED_ERROR: 'Unexpected Redis cache connection error',
  RATE_LIMITER_UNEXPECTED_ERROR: 'Unexpected Redis Rate Limiter connection error',
  CONNECTION_DEGRADED: 'Redis connection degraded',
  CONNECTION_STILL_DEGRADED: 'Redis connection still degraded',
  CONNECTION_RECOVERED: 'Redis connection recovered',
} as const
