export const RATE_LIMITER_LOGS = {
  INFRA_DEGRADED: 'RedisRateLimiter com erro: Redis não disponível, permitindo requisições (fail-open).',
  INFRA_STILL_DEGRADED: 'RedisRateLimiter continua degradado: Redis indisponível, permitindo requisições (fail-open).',
  INFRA_RECOVERED: 'RedisRateLimiter restabelecido: Redis disponível novamente.',
  TOO_MANY_LIMITERS: 'ALERTA: Muitos RateLimiters instanciados. Verifique se providers estão estáticos.',
  NO_INSTANCE_TO_DESTROY: 'Nenhuma instância de RedisRateLimiter para destruir.',
} as const
