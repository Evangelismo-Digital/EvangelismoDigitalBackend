/**
 * The options each Redis connection is built with.
 *
 * Every one of these was chosen for a reason the factory's comments record —
 * the rate limiter fails fast, the cache gives up after two reconnects, the
 * outbox subscriber never queues offline — and none of it was asserted: the
 * existing specs only covered the error logging. The ioredis 5 → 6 upgrade
 * changed several DEFAULTS (reconnect backoff, keepAlive, protocol), which is
 * exactly when an option that silently stopped being passed would start to
 * matter. These pin what each factory hands to the client.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

const { env, logger, RedisConstructor } = vi.hoisted(() => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_LOG_OUTAGE_INTERVAL_MS: 60_000,
  },
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  RedisConstructor: vi.fn(),
}))

vi.mock('@config/env/index', () => ({ env }))
vi.mock('@infra/logger', () => ({ logger }))
vi.mock('ioredis', () => ({
  default: RedisConstructor.mockImplementation(function FakeRedisConstructor() {
    return new EventEmitter()
  }),
}))

import { REDIS_LOGS } from '@common/messages/constants/logs/redis'
import { OUTBOX_LOGS } from '@common/messages/constants/logs/outbox'

type RedisOptions = {
  password?: string
  enableOfflineQueue?: boolean
  lazyConnect?: boolean
  commandTimeout?: number
  maxRetriesPerRequest?: number | null
  retryStrategy?: (times: number) => number | null
}

/** Fresh module instances, so module-level config re-reads the mocked env. */
async function load() {
  vi.resetModules()
  return {
    cache: await import('./redis-cache-connection.js'),
    rateLimiter: await import('./redis-rate-limiter-connection.js'),
    bullmq: await import('./redis-bullMQ-connection.js'),
    outbox: await import('./redis-outbox-signal-connection.js'),
  }
}

function optionsOf(factory: () => unknown): RedisOptions {
  RedisConstructor.mockClear()
  factory()
  return RedisConstructor.mock.calls[0]?.[0] as RedisOptions
}

beforeEach(() => {
  vi.clearAllMocks()
  env.NODE_ENV = 'test'
  env.REDIS_PASSWORD = ''
})

describe('password', () => {
  it('is omitted when REDIS_PASSWORD is empty, on every connection', async () => {
    const m = await load()

    for (const factory of [
      m.cache.createRedisCacheConnection,
      m.rateLimiter.createRedisRateLimiterConnection,
      m.bullmq.createRedisBullMQConnection,
      m.outbox.createOutboxPublisherConnection,
      m.outbox.createOutboxSubscriberConnection,
    ]) {
      expect(optionsOf(factory).password).toBeUndefined()
    }
  })

  it('is passed through when REDIS_PASSWORD is set, on every connection', async () => {
    env.REDIS_PASSWORD = 's3cret'
    const m = await load()

    for (const factory of [
      m.cache.createRedisCacheConnection,
      m.rateLimiter.createRedisRateLimiterConnection,
      m.bullmq.createRedisBullMQConnection,
      m.outbox.createOutboxPublisherConnection,
      m.outbox.createOutboxSubscriberConnection,
    ]) {
      expect(optionsOf(factory).password).toBe('s3cret')
    }
  })
})

describe('cache connection', () => {
  it('queues commands while reconnecting', async () => {
    const { cache } = await load()

    expect(optionsOf(cache.createRedisCacheConnection).enableOfflineQueue).toBe(true)
  })

  it('backs off linearly and gives up after two reconnect attempts', async () => {
    const { cache } = await load()
    const retry = optionsOf(cache.createRedisCacheConnection).retryStrategy!

    expect(retry(1)).toBe(50)
    expect(retry(2)).toBe(100)
    expect(retry(3)).toBeNull()
  })
})

describe('rate-limiter connection', () => {
  it('times commands out after 100 ms outside tests', async () => {
    env.NODE_ENV = 'production'
    const { rateLimiter } = await load()

    expect(optionsOf(rateLimiter.createRedisRateLimiterConnection).commandTimeout).toBe(100)
  })

  it('relaxes the command timeout to 1 s under test', async () => {
    const { rateLimiter } = await load()

    expect(optionsOf(rateLimiter.createRedisRateLimiterConnection).commandTimeout).toBe(1000)
  })

  it('never queues offline and never retries a command', async () => {
    const { rateLimiter } = await load()
    const options = optionsOf(rateLimiter.createRedisRateLimiterConnection)

    expect(options.enableOfflineQueue).toBe(false)
    expect(options.maxRetriesPerRequest).toBe(0)
  })
})

describe('BullMQ connection', () => {
  it('disables per-request retries, as BullMQ requires', async () => {
    const { bullmq } = await load()

    expect(optionsOf(bullmq.createRedisBullMQConnection).maxRetriesPerRequest).toBeNull()
  })
})

describe('outbox signal connections', () => {
  it('connect lazily, both of them', async () => {
    const { outbox } = await load()

    expect(optionsOf(outbox.createOutboxPublisherConnection).lazyConnect).toBe(true)
    expect(optionsOf(outbox.createOutboxSubscriberConnection).lazyConnect).toBe(true)
  })

  it('queue offline on the publisher only', async () => {
    const { outbox } = await load()

    expect(optionsOf(outbox.createOutboxPublisherConnection).enableOfflineQueue).toBe(true)
    expect(optionsOf(outbox.createOutboxSubscriberConnection).enableOfflineQueue).toBe(false)
  })

  it('reconnect the subscriber with exponential backoff capped at 5 s, logging each attempt', async () => {
    const { outbox } = await load()
    const retry = optionsOf(outbox.createOutboxSubscriberConnection).retryStrategy!

    expect(retry(1)).toBe(200)
    expect(retry(3)).toBe(800)
    expect(retry(10)).toBe(5000)
    expect(logger.warn).toHaveBeenCalledWith({ times: 1, delay: 200 }, 'Reconnecting outbox subscriber...')
  })

  it.each([
    ['publisher', 'createOutboxPublisherConnection', 'outbox-publisher', OUTBOX_LOGS.PUBLISHER_ERROR],
    ['subscriber', 'createOutboxSubscriberConnection', 'outbox-subscriber', OUTBOX_LOGS.SUBSCRIBER_ERROR],
  ] as const)('label the %s outage logs with its own subsystem', async (_label, factory, subsystem, message) => {
    const { outbox } = await load()
    const redis = outbox[factory]() as unknown as EventEmitter

    redis.emit('error', new Error('WRONGTYPE Operation against a key'))

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ subsystem }), message)
  })
})

describe('attachRedisLogger', () => {
  async function attached(context = 'MailWorker') {
    const { bullmq } = await load()
    const redis = new EventEmitter()
    bullmq.attachRedisLogger(redis as never, context)
    return redis
  }

  it('logs the connection and readiness with its context', async () => {
    const redis = await attached()

    redis.emit('connect')
    redis.emit('ready')

    expect(logger.info).toHaveBeenCalledWith('Conexão Redis (MailWorker) estabelecida')
    expect(logger.info).toHaveBeenCalledWith('Redis (MailWorker) pronto')
  })

  it.each(['connect', 'ready'])('closes an open outage on "%s"', async (event) => {
    const redis = await attached()
    redis.emit('close')
    logger.info.mockClear()

    redis.emit(event)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ subsystem: 'bullmq' }),
      REDIS_LOGS.CONNECTION_RECOVERED,
    )
  })

  it('reports a close as a bullmq outage', async () => {
    const redis = await attached()

    redis.emit('close')

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ subsystem: 'bullmq', event: 'close' }),
      REDIS_LOGS.CONNECTION_DEGRADED,
    )
  })

  it('routes a connectivity error to the outage logger, not to logger.error', async () => {
    const redis = await attached()
    const error = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })

    redis.emit('error', error)

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ subsystem: 'bullmq', event: 'error', err: error }),
      REDIS_LOGS.CONNECTION_DEGRADED,
    )
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs an unexpected error with its context and message', async () => {
    const redis = await attached('OutboxDispatchWorker')

    redis.emit('error', new Error('WRONGTYPE Operation against a key'))

    expect(logger.error).toHaveBeenCalledWith(
      { context: 'OutboxDispatchWorker', err: 'WRONGTYPE Operation against a key' },
      'Instabilidade na conexão Redis',
    )
    expect(logger.warn).not.toHaveBeenCalled()
  })
})
