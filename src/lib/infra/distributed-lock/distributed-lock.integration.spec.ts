/**
 * Integration — DistributedLock against a real Redis (docker-compose).
 * Exercises the SET NX PX acquire and the ownership-guarded Lua renew/release.
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Redis } from 'ioredis'
import { DistributedLock } from './distributed-lock'
import { getRedisCache, closeAllRedisConnections } from '@lib/redis/clients/clients'

const KEY = 'lock:it:distributed-lock'
let redis: Redis

beforeAll(async () => {
  redis = getRedisCache()
  if (redis.status !== 'ready') await new Promise<void>((r) => redis.once('ready', () => r()))
})

afterEach(async () => {
  await redis.del(KEY, `${KEY}:b`)
})

afterAll(async () => {
  await closeAllRedisConnections()
})

describe('DistributedLock (integration, real Redis)', () => {
  it('acquire → stores a token and sets a bounded PX TTL', async () => {
    const token = await DistributedLock.acquire(KEY, 5_000)

    expect(token).toBeTypeOf('string')
    expect(await redis.get(KEY)).toBe(token)
    const pttl = await redis.pttl(KEY)
    expect(pttl).toBeGreaterThan(0)
    expect(pttl).toBeLessThanOrEqual(5_000)
  })

  it('acquire on a held key → returns null (contention), original owner keeps the lock', async () => {
    const first = await DistributedLock.acquire(KEY, 5_000)
    const second = await DistributedLock.acquire(KEY, 5_000)

    expect(first).toBeTypeOf('string')
    expect(second).toBeNull()
    expect(await redis.get(KEY)).toBe(first)
  })

  it('renew → only the owning token can extend the TTL', async () => {
    const token = await DistributedLock.acquire(KEY, 1_000)
    expect(token).not.toBeNull()

    const renewedByOwner = await DistributedLock.renew(KEY, token as string, 8_000)
    expect(renewedByOwner).toBe(true)
    expect(await redis.pttl(KEY)).toBeGreaterThan(5_000)

    const renewedByImpostor = await DistributedLock.renew(KEY, 'not-the-owner', 20_000)
    expect(renewedByImpostor).toBe(false)
    expect(await redis.pttl(KEY)).toBeLessThanOrEqual(8_000) // impostor did not extend it
  })

  it('release → owner deletes the key; a non-owner release is a no-op', async () => {
    const token = await DistributedLock.acquire(KEY, 5_000)

    await DistributedLock.release(KEY, 'someone-else')
    expect(await redis.get(KEY)).toBe(token) // untouched

    await DistributedLock.release(KEY, token as string)
    expect(await redis.exists(KEY)).toBe(0)
  })

  it('release after the lock expired and was re-acquired → does not delete the new owner’s lock', async () => {
    const stale = await DistributedLock.acquire(KEY, 5_000)
    // Simulate natural TTL expiry + a different instance taking the lock.
    await redis.del(KEY)
    const fresh = await DistributedLock.acquire(KEY, 5_000)
    expect(fresh).not.toBe(stale)

    await DistributedLock.release(KEY, stale as string)

    expect(await redis.get(KEY)).toBe(fresh) // fresh owner protected by the Lua guard
  })

  it('two different keys are independent locks', async () => {
    const a = await DistributedLock.acquire(KEY, 5_000)
    const b = await DistributedLock.acquire(`${KEY}:b`, 5_000)

    expect(a).toBeTypeOf('string')
    expect(b).toBeTypeOf('string')
    expect(a).not.toBe(b)
  })
})
