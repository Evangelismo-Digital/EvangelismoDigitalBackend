export const REDIS_LOGS = {
  BULLMQ_UNEXPECTED_ERROR: 'Erro inesperado na conexão Redis do BullMQ',
  CACHE_UNEXPECTED_ERROR: 'Erro inesperado na conexão Redis do cache',
  RATE_LIMITER_UNEXPECTED_ERROR: 'Erro inesperado na conexão Redis do limitador de taxa',
  CONNECTION_DEGRADED: 'Conexão Redis degradada',
  CONNECTION_STILL_DEGRADED: 'Conexão Redis continua degradada',
  CONNECTION_RECOVERED: 'Conexão Redis restabelecida',
} as const
