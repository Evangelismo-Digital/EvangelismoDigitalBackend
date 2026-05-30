import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@env/index', () => ({
  env: {
    REDIS_LOG_OUTAGE_INTERVAL_MS: 30000,
  },
}))

vi.mock('@lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { logger } from '@lib/logger'
import { RedisOutageLogger, isRedisConnectivityError } from './redis-outage-logger'

describe('RedisOutageLogger', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    vi.clearAllMocks()
  })

  it('should log one warning when outage starts', () => {
    const outageLogger = new RedisOutageLogger({
      subsystem: 'cache',
      host: '127.0.0.1',
      port: 6379,
    })

    outageLogger.onOutage('error', { message: 'connect ECONNREFUSED 127.0.0.1:6379', code: 'ECONNREFUSED' })

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        subsystem: 'cache',
        errorCode: 'ECONNREFUSED',
      }),
      'Redis connection degraded',
    )
  })

  it('should throttle warning logs and emit periodic warning', () => {
    const outageLogger = new RedisOutageLogger({
      subsystem: 'cache',
      host: '127.0.0.1',
      port: 6379,
    })

    outageLogger.onOutage('error', { message: 'connect ECONNREFUSED 127.0.0.1:6379', code: 'ECONNREFUSED' })
    outageLogger.onOutage('error', { message: 'connect ECONNREFUSED 127.0.0.1:6379', code: 'ECONNREFUSED' })

    expect(logger.warn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(30000)

    outageLogger.onOutage('error', { message: 'connect ECONNREFUSED 127.0.0.1:6379', code: 'ECONNREFUSED' })

    expect(logger.warn).toHaveBeenCalledTimes(2)
    expect(logger.warn).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        subsystem: 'cache',
        suppressedEvents: 1,
      }),
      'Redis connection still degraded',
    )
  })

  it('should emit recovery summary once after outage', () => {
    const outageLogger = new RedisOutageLogger({
      subsystem: 'bullmq',
      host: '127.0.0.1',
      port: 6379,
    })

    outageLogger.onOutage('close')
    vi.advanceTimersByTime(5000)

    outageLogger.onRecovery()
    outageLogger.onRecovery()

    expect(logger.info).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        subsystem: 'bullmq',
        outageDurationMs: 5000,
      }),
      'Redis connection recovered',
    )
  })
})

describe('isRedisConnectivityError', () => {
  it('returns true for connectivity errors', () => {
    expect(isRedisConnectivityError({ code: 'ECONNREFUSED' })).toBe(true)
    expect(isRedisConnectivityError({ message: 'Connection is closed.' })).toBe(true)
  })

  it('returns false for non-connectivity errors', () => {
    expect(isRedisConnectivityError({ message: 'WRONGTYPE Operation against a key holding the wrong kind of value' })).toBe(false)
  })
})
