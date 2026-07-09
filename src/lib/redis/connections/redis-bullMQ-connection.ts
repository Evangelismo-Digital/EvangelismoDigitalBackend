import { env } from '@env/index'
import { logger } from '@lib/logger'
import Redis from 'ioredis'
import { isRedisConnectivityError, RedisOutageLogger } from './redis-outage-logger'
import { REDIS_LOGS } from 'messages/constants/logs/redis'

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

  const outageLogger = new RedisOutageLogger({
    subsystem: 'bullmq',
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  })

  redis.on('ready', () => {
    outageLogger.onRecovery()
  })

  redis.on('connect', () => {
    outageLogger.onRecovery()
  })

  redis.on('error', (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage('error', error)
      return
    }

    logger.error(
      {
        subsystem: 'bullmq',
        redisHost: env.REDIS_HOST,
        redisPort: env.REDIS_PORT,
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      },
      REDIS_LOGS.BULLMQ_UNEXPECTED_ERROR,
    )
  })

  redis.on('close', () => {
    outageLogger.onOutage('close')
  })

  return redis
}

export function attachRedisLogger(redis: Redis, context: string) {
  const outageLogger = new RedisOutageLogger({
    subsystem: 'bullmq',
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
  })

  redis.on('connect', () => {
    logger.info(`Conexão Redis (${context}) estabelecida`)
    outageLogger.onRecovery()
  })
  redis.on('ready', () => {
    logger.info(`Redis (${context}) pronto`)
    outageLogger.onRecovery()
  })

  redis.on('error', (error) => {
    if (isRedisConnectivityError(error)) {
      outageLogger.onOutage('error', error)
      return
    }

    logger.error({ context, err: error.message }, 'Instabilidade na conexão Redis')
  })

  redis.on('close', () => {
    outageLogger.onOutage('close')
  })
}
