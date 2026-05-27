import { env } from '@env/index'
import { logger } from '@lib/logger'
import Redis from 'ioredis'

export function createRedisBullMQConnection() {
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Obrigatório para BullMQ

    // === CORREÇÃO DE INFRAESTRUTURA (DOCKER) ===
    family: 4, // Força IPv4. Resolve instabilidade de rede no Docker.

    // === CONFIGURAÇÕES DE Tentativa de Conexão ===
    /*retryStrategy: (times) => {
      return Math.min(times * 50, 2000)
    },*/
  })

  redis.on('error', (error) => {
    logger.error(
      {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      },
      '❌ Redis BullMQ connection error',
    )
  })

  redis.on('close', () => {
    logger.warn('⚠️ Redis BullMQ connection closed')
  })

  return redis
}

export function attachRedisLogger(redis: Redis, context: string) {
  redis.on('connect', () => logger.info(`🔗 Redis (${context}) connection established`))
  redis.on('ready', () => logger.info(`✅ Redis (${context}) is ready`))
  // Silencia erros de reconexão normais, loga apenas se for crítico
  redis.on('error', (error) => {
    // Evita spam de logs se o Redis estiver reiniciando
    if (!error.message.includes('ECONNREFUSED')) {
      logger.error({ err: error.message }, '❌ Redis connection glitch')
    }
  })
}
