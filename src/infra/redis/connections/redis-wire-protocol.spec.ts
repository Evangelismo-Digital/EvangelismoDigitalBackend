/**
 * Every production Redis connection must pin the wire protocol.
 *
 * ioredis 6 changed its default from RESP2 to RESP3. The upgrade happened for a
 * security fix (SNYK-JS-IOREDIS-19963957), not to change what goes over the
 * wire under the queues, locks, cache and rate limiter — so each factory keeps
 * the v5 protocol explicitly. A factory that forgets it silently switches that
 * one connection to RESP3, which no other test would notice.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('@config/env/index', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: '',
    REDIS_LOG_OUTAGE_INTERVAL_MS: 60_000,
  },
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const { RedisConstructor } = vi.hoisted(() => ({
  RedisConstructor: vi.fn(),
}))

vi.mock('ioredis', () => ({
  default: RedisConstructor.mockImplementation(function FakeRedisConstructor() {
    return new EventEmitter()
  }),
}))

import { REDIS_WIRE_PROTOCOL } from './redis-wire-protocol'
import { createRedisCacheConnection } from './redis-cache-connection'
import { createRedisRateLimiterConnection } from './redis-rate-limiter-connection'
import { createRedisBullMQConnection } from './redis-bullMQ-connection'
import { createOutboxPublisherConnection, createOutboxSubscriberConnection } from './redis-outbox-signal-connection'

const FACTORIES = [
  ['cache', createRedisCacheConnection],
  ['rate limiter', createRedisRateLimiterConnection],
  ['BullMQ', createRedisBullMQConnection],
  ['outbox publisher', createOutboxPublisherConnection],
  ['outbox subscriber', createOutboxSubscriberConnection],
] as const

describe('Redis wire protocol', () => {
  beforeEach(() => {
    RedisConstructor.mockClear()
  })

  it('is RESP2, the protocol ioredis 5 spoke', () => {
    expect(REDIS_WIRE_PROTOCOL).toBe(2)
  })

  it.each(FACTORIES)('the %s connection pins it', (_label, factory) => {
    factory()

    expect(RedisConstructor).toHaveBeenCalledTimes(1)
    expect(RedisConstructor).toHaveBeenCalledWith(expect.objectContaining({ protocol: 2 }))
  })

  it.each(FACTORIES)('the %s connection keeps its own options alongside the protocol', (_label, factory) => {
    // Counterweight: pinning the protocol must not replace the per-connection
    // tuning (host, port) with a shared object.
    factory()

    expect(RedisConstructor).toHaveBeenCalledWith(expect.objectContaining({ host: 'localhost', port: 6379 }))
  })
})
