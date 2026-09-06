/**
 * The outage wiring shared by all three Redis connections.
 *
 * It used to be copied into each connection factory, where the specs only
 * checked that handlers were registered — never what they did. Now that one
 * copy serves cache, rate limiter and BullMQ alike, a mistake here would be a
 * mistake in all three at once.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type Redis from 'ioredis'

const { onOutage, onRecovery } = vi.hoisted(() => ({
  onOutage: vi.fn(),
  onRecovery: vi.fn(),
}))

vi.mock('./redis-outage-logger', () => ({
  RedisOutageLogger: class {
    onOutage = onOutage
    onRecovery = onRecovery
  },
  // Only ECONNREFUSED counts as connectivity here, so the two branches are
  // unambiguous; the real predicate has its own spec.
  isRedisConnectivityError: (error: unknown) => (error as Error)?.message === 'ECONNREFUSED',
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { attachOutageLogging } from './attach-outage-logging'
import { logger } from '@lib/logger'

describe('attachOutageLogging', () => {
  let redis: EventEmitter

  beforeEach(() => {
    vi.clearAllMocks()
    redis = new EventEmitter()
    attachOutageLogging(redis as unknown as Redis, 'cache', 'erro inesperado do redis')
  })

  it('treats "ready" as a recovery', () => {
    redis.emit('ready')

    expect(onRecovery).toHaveBeenCalledTimes(1)
  })

  it('treats "connect" as a recovery too', () => {
    redis.emit('connect')

    expect(onRecovery).toHaveBeenCalledTimes(1)
  })

  it('reports a close as an outage', () => {
    redis.emit('close')

    expect(onOutage).toHaveBeenCalledWith('close')
  })

  it('routes a connectivity error to the rate-limited outage logger', () => {
    // The whole point of the outage logger: a flapping connection must not
    // produce one log line per event.
    const error = new Error('ECONNREFUSED')

    redis.emit('error', error)

    expect(onOutage).toHaveBeenCalledWith('error', error)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('logs an unexpected error in full instead of rate-limiting it', () => {
    const error = new Error('WRONGTYPE Operation against a key')

    redis.emit('error', error)

    expect(onOutage).not.toHaveBeenCalled()
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ subsystem: 'cache', err: error }),
      'erro inesperado do redis',
    )
  })

  it('labels the log with the subsystem it was attached to', () => {
    const other = new EventEmitter()
    attachOutageLogging(other as unknown as Redis, 'bullmq', 'falha do bullmq')

    other.emit('error', new Error('WRONGTYPE'))

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ subsystem: 'bullmq' }), 'falha do bullmq')
  })
})
