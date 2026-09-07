import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Redis from 'ioredis'

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/**
 * The counters are `null` whenever METRICS_ENABLED is off — which is the case in
 * tests, and in any deployment that has not turned metrics on. Holding them in a
 * mutable box behind getters lets one file cover both worlds: a wired counter,
 * and the null the optional chaining exists for.
 */
const { metricsState } = vi.hoisted(() => ({
  metricsState: {
    degraded: null as { inc: (labels: object) => void } | null,
    recovered: null as { inc: (labels: object) => void } | null,
  },
}))

vi.mock('@lib/metrics/rate-limiter-metrics', () => ({
  get collectMetricsHttpRateLimitDegraded() {
    return metricsState.degraded
  },
  get collectMetricsHttpRateLimitRecovered() {
    return metricsState.recovered
  },
}))

import { logger } from '@lib/logger'
import { RATE_LIMITER_LOGS } from 'messages/constants/logs/rate-limiter'
import { OutageReporter } from './outage-reporter'
import {
  LocalFixedWindowCounter,
  RedisFixedWindowCounter,
  ResilientRateLimitStore,
  resilientRateLimitStoreFor,
  type RateLimitStoreResult,
} from './resilient-rate-limit-store'

type CommandImpl = (key: string, timeWindowMs: number) => Promise<[number, number]>

interface FakeRedis {
  defineCommand: ReturnType<typeof vi.fn>
  [command: string]: unknown
}

/**
 * ioredis installs a custom command as a method on the client, which is exactly
 * what the counter looks for. The double reproduces that, and nothing else.
 */
function fakeRedis(impl: CommandImpl): FakeRedis {
  const client: FakeRedis = {
    defineCommand: vi.fn((name: string) => {
      client[name] = vi.fn(impl)
    }),
  }

  return client
}

const asRedis = (client: FakeRedis): Redis => client as unknown as Redis

/** Collects what the plugin would have received from a store call. */
function incrOnce(
  store: ResilientRateLimitStore,
  key: string,
  timeWindowMs: number,
): Promise<{ error: Error | null; result?: RateLimitStoreResult }> {
  return new Promise((resolve) => {
    store.incr(key, (error, result) => resolve({ error, result }), timeWindowMs)
  })
}

function makeStore(client: FakeRedis, reporter = new OutageReporter({ messages: MESSAGES })) {
  return new ResilientRateLimitStore({ redis: asRedis(client), reporter })
}

const MESSAGES = { degraded: 'degradado', stillDegraded: 'ainda', recovered: 'ok' }

describe('LocalFixedWindowCounter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts up inside the window', () => {
    const counter = new LocalFixedWindowCounter()

    expect(counter.incr('ip', 1_000).current).toBe(1)
    expect(counter.incr('ip', 1_000).current).toBe(2)
    expect(counter.incr('ip', 1_000).current).toBe(3)
  })

  it('reports the time left in the window, not the whole window', () => {
    const counter = new LocalFixedWindowCounter()

    counter.incr('ip', 1_000)
    vi.advanceTimersByTime(400)

    expect(counter.incr('ip', 1_000).ttl).toBe(600)
  })

  it('starts a new window once the old one has elapsed', () => {
    const counter = new LocalFixedWindowCounter()

    counter.incr('ip', 1_000)
    counter.incr('ip', 1_000)
    vi.advanceTimersByTime(1_000)

    expect(counter.incr('ip', 1_000)).toEqual({ current: 1, ttl: 1_000 })
  })

  it('keeps the window open right up to its final millisecond', () => {
    const counter = new LocalFixedWindowCounter()

    counter.incr('ip', 1_000)
    vi.advanceTimersByTime(999)

    expect(counter.incr('ip', 1_000).current).toBe(2)
  })

  it('counts each key separately', () => {
    const counter = new LocalFixedWindowCounter()

    counter.incr('a', 1_000)
    counter.incr('a', 1_000)

    expect(counter.incr('b', 1_000).current).toBe(1)
  })

  describe('the memory bound', () => {
    it('never grows past its cap, however many keys arrive', () => {
      const counter = new LocalFixedWindowCounter(3)

      for (let i = 0; i < 50; i += 1) {
        counter.incr(`ip-${i}`, 60_000)
      }

      expect(counter.size).toBe(3)
    })

    it('evicts the oldest window first', () => {
      const counter = new LocalFixedWindowCounter(2)

      counter.incr('first', 60_000)
      counter.incr('second', 60_000)
      counter.incr('third', 60_000)

      // 'first' was dropped, so it starts over; 'third' is still counting.
      expect(counter.incr('first', 60_000).current).toBe(1)
      expect(counter.incr('third', 60_000).current).toBe(2)
    })

    it('does not evict anything to refresh a key it is already holding', () => {
      // 'b' is the oldest entry, so it is what an eviction would take. Its window
      // is long enough to still be counting when 'a' restarts — otherwise the
      // assertion cannot tell an eviction from an ordinary expiry.
      const counter = new LocalFixedWindowCounter(2)

      counter.incr('b', 60_000)
      counter.incr('a', 1_000)
      vi.advanceTimersByTime(1_000)
      counter.incr('a', 1_000)

      expect(counter.size).toBe(2)
      expect(counter.incr('b', 60_000).current).toBe(2)
    })
  })
})

describe('RedisFixedWindowCounter', () => {
  it('registers the Lua command once per connection', () => {
    const client = fakeRedis(async () => [1, 1_000])

    new RedisFixedWindowCounter(asRedis(client))
    new RedisFixedWindowCounter(asRedis(client))

    expect(client.defineCommand).toHaveBeenCalledOnce()
    expect(client.defineCommand).toHaveBeenCalledWith(
      'httpRateLimitIncr',
      expect.objectContaining({ numberOfKeys: 1, lua: expect.stringContaining('INCR') }),
    )
  })

  it('maps the Lua reply onto the store result', async () => {
    const client = fakeRedis(async () => [7, 421])
    const counter = new RedisFixedWindowCounter(asRedis(client))

    await expect(counter.incr('key', 1_000)).resolves.toEqual({ current: 7, ttl: 421 })
  })

  it('passes the key and window through to Redis', async () => {
    const command = vi.fn<CommandImpl>(async () => [1, 1_000])
    const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }

    await new RedisFixedWindowCounter(asRedis(client)).incr('prefix-1.2.3.4', 5_000)

    expect(command).toHaveBeenCalledWith('prefix-1.2.3.4', 5_000)
  })

  it('fails loudly, and by name, if ioredis did not install the command', () => {
    // The message matters: without the guard the very next line throws its own
    // TypeError on `undefined.bind`, so asserting only the class passes either way.
    const client: FakeRedis = { defineCommand: vi.fn() }

    expect(() => new RedisFixedWindowCounter(asRedis(client))).toThrow(
      'ioredis não registrou o comando httpRateLimitIncr',
    )
  })

  it('surfaces a Redis rejection to its caller', async () => {
    const client = fakeRedis(() => Promise.reject(new Error('Command timed out')))

    await expect(new RedisFixedWindowCounter(asRedis(client)).incr('k', 1_000)).rejects.toThrow('Command timed out')
  })
})

describe('ResilientRateLimitStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('while Redis answers', () => {
    it('serves the Redis count and namespaces the key', async () => {
      const command = vi.fn<CommandImpl>(async () => [3, 900])
      const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }

      const outcome = await incrOnce(makeStore(client), '203.0.113.10', 60_000)

      expect(outcome).toEqual({ error: null, result: { current: 3, ttl: 900 } })
      expect(command).toHaveBeenCalledWith('fastify-rate-limit-203.0.113.10', 60_000)
    })

    it('says nothing about degradation', async () => {
      const client = fakeRedis(async () => [1, 900])

      await incrOnce(makeStore(client), 'ip', 60_000)

      expect(logger.warn).not.toHaveBeenCalled()
    })
  })

  describe('when Redis fails', () => {
    it('never hands the request an error — that was the outage', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('Command timed out')))

      const outcome = await incrOnce(makeStore(client), 'ip', 60_000)

      expect(outcome.error).toBeNull()
      expect(outcome.result).toEqual({ current: 1, ttl: 60_000 })
    })

    it('keeps counting locally, so the limit still bites during the outage', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const store = makeStore(client)

      await incrOnce(store, 'ip', 60_000)
      await incrOnce(store, 'ip', 60_000)
      const third = await incrOnce(store, 'ip', 60_000)

      expect(third.result?.current).toBe(3)
    })

    it('counts each caller separately while degraded', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const store = makeStore(client)

      await incrOnce(store, 'first', 60_000)
      await incrOnce(store, 'first', 60_000)
      const other = await incrOnce(store, 'second', 60_000)

      expect(other.result?.current).toBe(1)
    })

    it('reports the degradation', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('Command timed out')))

      await incrOnce(makeStore(client), 'ip', 60_000)

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ route: 'global', mode: 'fail-open', redisOutage: true }),
        MESSAGES.degraded,
      )
    })

    it('reports recovery when Redis comes back, and resumes the shared count', async () => {
      let healthy = false
      const client = fakeRedis(() =>
        healthy ? Promise.resolve<[number, number]>([9, 800]) : Promise.reject(new Error('down')),
      )
      const store = makeStore(client)

      await incrOnce(store, 'ip', 60_000)
      healthy = true
      const afterRecovery = await incrOnce(store, 'ip', 60_000)

      expect(afterRecovery.result).toEqual({ current: 9, ttl: 800 })
      expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ route: 'global' }), MESSAGES.recovered)
    })
  })

  describe('per-route children', () => {
    it('gives each route its own key space', async () => {
      const command = vi.fn<CommandImpl>(async () => [1, 900])
      const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }
      const child = makeStore(client).child({ routeInfo: { method: 'POST', url: '/users' } })

      await incrOnce(child, '203.0.113.10', 60_000)

      expect(command).toHaveBeenCalledWith('fastify-rate-limit-POST/users-203.0.113.10', 60_000)
    })

    it('labels the route in what it reports', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const child = makeStore(client).child({ routeInfo: { method: 'POST', url: '/users' } })

      await incrOnce(child, 'ip', 60_000)

      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ route: 'POST /users' }), MESSAGES.degraded)
    })

    it('reads the route off the bare options when there is no routeInfo', async () => {
      const command = vi.fn<CommandImpl>(async () => [1, 900])
      const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }
      const child = makeStore(client).child({ method: 'GET', url: '/health' })

      await incrOnce(child, 'ip', 60_000)

      expect(command).toHaveBeenCalledWith('fastify-rate-limit-GET/health-ip', 60_000)
    })

    it('joins a multi-verb route into one key space', async () => {
      const command = vi.fn<CommandImpl>(async () => [1, 900])
      const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }
      const child = makeStore(client).child({ routeInfo: { method: ['GET', 'HEAD'], url: '/x' } })

      await incrOnce(child, 'ip', 60_000)

      expect(command).toHaveBeenCalledWith('fastify-rate-limit-GET,HEAD/x-ip', 60_000)
    })

    it('keeps the parent label when the route identifies itself with nothing', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const child = makeStore(client).child({})

      await incrOnce(child, 'ip', 60_000)

      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ route: 'global' }), MESSAGES.degraded)
    })

    it('shares one outage episode with its parent — an outage is not per route', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const parent = makeStore(client)
      const child = parent.child({ routeInfo: { method: 'GET', url: '/a' } })

      await incrOnce(parent, 'ip', 60_000)
      await incrOnce(child, 'ip', 60_000)

      expect(logger.warn).toHaveBeenCalledOnce()
    })

    it('does not let two routes consume the same window while degraded', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const parent = makeStore(client)
      const a = parent.child({ routeInfo: { method: 'GET', url: '/a' } })
      const b = parent.child({ routeInfo: { method: 'GET', url: '/b' } })

      await incrOnce(a, 'ip', 60_000)
      await incrOnce(a, 'ip', 60_000)
      const onB = await incrOnce(b, 'ip', 60_000)

      expect(onB.result?.current).toBe(1)
    })
  })

  describe('the fallback cap', () => {
    it('honours the cap it was given rather than the default', async () => {
      const client = fakeRedis(() => Promise.reject(new Error('down')))
      const store = new ResilientRateLimitStore({
        redis: asRedis(client),
        reporter: new OutageReporter({ messages: MESSAGES }),
        maxFallbackKeys: 2,
      })

      await incrOnce(store, 'first', 60_000)
      await incrOnce(store, 'second', 60_000)
      await incrOnce(store, 'third', 60_000)

      // 'first' was evicted, so it starts over. On the default cap of 5 000 it
      // would still be counting and come back as 2.
      expect((await incrOnce(store, 'first', 60_000)).result?.current).toBe(1)
    })
  })

  describe('the window the plugin passes', () => {
    it('falls back to a minute if the plugin passes none', async () => {
      const command = vi.fn<CommandImpl>(async () => [1, 900])
      const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }
      const store = makeStore(client)

      await new Promise<void>((resolve) => {
        store.incr('ip', () => resolve())
      })

      expect(command).toHaveBeenCalledWith('fastify-rate-limit-ip', 60_000)
    })
  })
})

describe('the reporter the plugin store is built with', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    metricsState.degraded = null
    metricsState.recovered = null
  })

  function storeFor(failing: () => boolean) {
    const client = fakeRedis(() =>
      failing() ? Promise.reject(new Error('down')) : Promise.resolve<[number, number]>([1, 900]),
    )
    const Store = resilientRateLimitStoreFor(asRedis(client))

    return new Store()
  }

  it('reports the outage with the HTTP messages', async () => {
    await incrOnce(
      storeFor(() => true),
      'ip',
      60_000,
    )

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'global' }),
      RATE_LIMITER_LOGS.HTTP_INFRA_DEGRADED,
    )
  })

  it('reports the recovery with the HTTP message', async () => {
    let failing = true
    const store = storeFor(() => failing)

    await incrOnce(store, 'ip', 60_000)
    failing = false
    await incrOnce(store, 'ip', 60_000)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ route: 'global' }),
      RATE_LIMITER_LOGS.HTTP_INFRA_RECOVERED,
    )
  })

  it('counts every degraded request, and the recovery once', async () => {
    metricsState.degraded = { inc: vi.fn() }
    metricsState.recovered = { inc: vi.fn() }
    let failing = true
    const store = storeFor(() => failing)

    await incrOnce(store, 'ip', 60_000)
    await incrOnce(store, 'ip', 60_000)
    failing = false
    await incrOnce(store, 'ip', 60_000)
    await incrOnce(store, 'ip', 60_000)

    expect(metricsState.degraded.inc).toHaveBeenCalledTimes(2)
    expect(metricsState.degraded.inc).toHaveBeenCalledWith({ route: 'global' })
    expect(metricsState.recovered.inc).toHaveBeenCalledOnce()
    expect(metricsState.recovered.inc).toHaveBeenCalledWith({ route: 'global' })
  })

  it('still serves the request when metrics are switched off and the counters are null', async () => {
    // The optional chaining on those counters is load-bearing: without it this
    // path throws inside the failure handler and the request never gets an answer.
    let failing = true
    const store = storeFor(() => failing)

    const degraded = await incrOnce(store, 'ip', 60_000)
    failing = false
    const recovered = await incrOnce(store, 'ip', 60_000)

    expect(degraded.result).toEqual({ current: 1, ttl: 60_000 })
    expect(recovered.result).toEqual({ current: 1, ttl: 900 })
  })
})

describe('resilientRateLimitStoreFor', () => {
  it('produces a zero-argument constructor, which is all the plugin will call', async () => {
    const command = vi.fn<CommandImpl>(async () => [2, 500])
    const client: FakeRedis = { defineCommand: vi.fn(), httpRateLimitIncr: command }

    const Store = resilientRateLimitStoreFor(asRedis(client))
    const outcome = await incrOnce(new Store(), 'ip', 60_000)

    expect(outcome.result).toEqual({ current: 2, ttl: 500 })
  })

  it('binds the connection it was given, not a global one', async () => {
    const first = vi.fn<CommandImpl>(async () => [1, 100])
    const second = vi.fn<CommandImpl>(async () => [1, 100])

    const StoreA = resilientRateLimitStoreFor(asRedis({ defineCommand: vi.fn(), httpRateLimitIncr: first }))
    const StoreB = resilientRateLimitStoreFor(asRedis({ defineCommand: vi.fn(), httpRateLimitIncr: second }))

    await incrOnce(new StoreA(), 'ip', 1_000)
    await incrOnce(new StoreB(), 'ip', 1_000)

    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })
})
