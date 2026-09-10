import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { logger } from '@lib/logger'
import { err, ok } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { AnalyticsRetention } from './analytics-retention'

const { lockMock } = vi.hoisted(() => ({ lockMock: vi.fn() }))

/**
 * The lock is exercised for real in `withDistributedLock`'s own tests; here it
 * is a pass-through so these cases test retention rather than Redis. The
 * `renew` callback is a spy, because "renews between batches" is part of the
 * behaviour under test — a sweep that never renews loses the lock mid-run.
 */
vi.mock('@lib/infra/distributed-lock/with-distributed-lock', () => ({
  withDistributedLock: lockMock,
}))

vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

const renew = vi.fn()

function passThroughLock() {
  lockMock.mockImplementation(async (params: { work: (r: () => Promise<void>) => Promise<void> }) => {
    await params.work(renew)
  })
}

let repository: InMemoryAnalyticsRepository
let retention: AnalyticsRetention

/** Seeds one visitor + session + N events, all stamped in the distant past. */
async function seedExpired(eventCount: number) {
  const ancient = new Date('2000-01-01T00:00:00Z')

  await repository.upsertVisitor({ visitorId: 'visitor-1' })
  await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

  for (let i = 0; i < eventCount; i++) {
    await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: `/a/${i}` })
  }

  repository.visitors[0].lastSeenAt = ancient
  repository.sessions[0].startedAt = ancient
  repository.events.forEach((event) => {
    event.occurredAt = ancient
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  passThroughLock()
  repository = new InMemoryAnalyticsRepository()
  retention = new AnalyticsRetention(repository)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AnalyticsRetention — success', () => {
  it('deletes data past its retention window', async () => {
    await seedExpired(3)

    await retention.purgeExpiredData()

    expect(repository.events).toHaveLength(0)
    expect(repository.sessions).toHaveLength(0)
    expect(repository.visitors).toHaveLength(0)
  })

  it('leaves data inside the window alone', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
    await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: '/a' })

    await retention.purgeExpiredData()

    // The counterweight to every deletion case above: a sweep that deleted
    // everything would satisfy them all and destroy the product.
    expect(repository.events).toHaveLength(1)
    expect(repository.sessions).toHaveLength(1)
    expect(repository.visitors).toHaveLength(1)
  })

  it('runs under the distributed lock', async () => {
    await retention.purgeExpiredData()

    expect(lockMock).toHaveBeenCalledTimes(1)
    expect(lockMock.mock.calls[0][0]).toMatchObject({ lockKey: 'lock:analytics-retention' })
  })

  it('renews the lock between batches', async () => {
    await seedExpired(3)

    await retention.purgeExpiredData()

    // Without renewal a long sweep loses the lock partway and a second pod
    // starts deleting the same rows concurrently.
    expect(renew).toHaveBeenCalled()
  })

  it('is idempotent — a second run over already-purged data deletes nothing more', async () => {
    await seedExpired(2)

    await retention.purgeExpiredData()
    await retention.purgeExpiredData()

    expect(repository.events).toHaveLength(0)
    expect(repository.visitors).toHaveLength(0)
  })

  it('does nothing when there is nothing to purge', async () => {
    await retention.purgeExpiredData()

    expect(repository.visitors).toHaveLength(0)
  })
})

describe('AnalyticsRetention — failure handling', () => {
  it('continues to the remaining tables when one purge fails', async () => {
    await seedExpired(2)
    repository.purgeEventsOlderThan = async () => err(new DatabaseQueryError(new Error('boom')))

    await retention.purgeExpiredData()

    // Retention is not transactional and must not be all-or-nothing: aborting
    // the sweep because events failed would let sessions and visitors grow
    // unbounded until someone noticed.
    expect(repository.visitors).toHaveLength(0)
  })

  it('does not throw when a purge fails', async () => {
    repository.purgeSessionsOlderThan = async () => err(new DatabaseQueryError(new Error('boom')))

    await expect(retention.purgeExpiredData()).resolves.toBeUndefined()
  })

  it('stops a table after its first failure rather than looping on it', async () => {
    await seedExpired(2)
    const failing = vi.fn(async () => err(new DatabaseQueryError(new Error('boom'))))
    repository.purgeEventsOlderThan = failing

    await retention.purgeExpiredData()

    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('stops at the per-run batch ceiling instead of looping forever', async () => {
    // A repository that always reports deletions would spin indefinitely without
    // the cap — the failure mode is a job that never finishes, not one that errs.
    const endless = vi.fn(async () => ok(1))
    repository.purgeEventsOlderThan = endless

    await retention.purgeExpiredData()

    expect(endless).toHaveBeenCalledTimes(100)
  })
})

/**
 * The retention WINDOW itself — how old is "too old".
 *
 * Every other case here stamps rows in the year 2000 and asserts they vanish,
 * which passes for any window length at all, and for a days-to-milliseconds
 * conversion off by a factor of a million. Mutation testing found exactly that:
 * flipping `SECONDS_PER_DAY * 1000` to a division survived the entire suite.
 * These two dates sit either side of the configured boundary.
 */
describe('AnalyticsRetention — the window', () => {
  async function seedAged(daysOld: number) {
    const when = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000)

    await repository.upsertVisitor({ visitorId: `visitor-${daysOld}` })
    await repository.upsertSession({ sessionId: `session-${daysOld}`, visitorId: `visitor-${daysOld}` })
    await repository.createEvent({ sessionId: `session-${daysOld}`, eventType: 'click', path: '/a' })

    const visitor = repository.visitors.find((v) => v.visitorId === `visitor-${daysOld}`)!
    const session = repository.sessions.find((s) => s.sessionId === `session-${daysOld}`)!
    visitor.lastSeenAt = when
    session.startedAt = when
    repository.events.forEach((event) => {
      event.occurredAt = when
    })
  }

  it('keeps data comfortably inside the window (100 days old)', async () => {
    await seedAged(100)

    await retention.purgeExpiredData()

    expect(repository.events).toHaveLength(1)
    expect(repository.visitors).toHaveLength(1)
  })

  it('purges data past the window (500 days old)', async () => {
    await seedAged(500)

    await retention.purgeExpiredData()

    expect(repository.events).toHaveLength(0)
    expect(repository.visitors).toHaveLength(0)
  })

  it('keeps a visitor just inside the 395-day visitor window (390 days)', async () => {
    await seedAged(390)

    await retention.purgeExpiredData()

    // The visitor window is deliberately SHORTER than the event window, so this
    // boundary is not interchangeable with the one above.
    expect(repository.visitors).toHaveLength(1)
  })

  it('purges a visitor just past the 395-day window (400 days)', async () => {
    await seedAged(400)

    await retention.purgeExpiredData()

    expect(repository.visitors).toHaveLength(0)
  })
})

describe('AnalyticsRetention — batching and reporting', () => {
  it('stops calling a table once a pass deletes nothing', async () => {
    await seedExpired(3)
    const spy = vi.spyOn(repository, 'purgeEventsOlderThan')

    await retention.purgeExpiredData()

    // One pass that deletes, one that comes back empty, then stop. Without the
    // empty-pass check the sweep would run to the 100-batch ceiling every night
    // against a table with nothing to do.
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('reports the per-table totals it deleted', async () => {
    await seedExpired(3)

    await retention.purgeExpiredData()

    expect(logger.info).toHaveBeenCalledWith(
      { deleted: { analytics_events: 3, analytics_sessions: 1, analytics_visitors: 1 } },
      expect.any(String),
    )
  })

  it('names the failing table in the error log', async () => {
    repository.purgeSessionsOlderThan = async () => err(new DatabaseQueryError(new Error('boom')))

    await retention.purgeExpiredData()

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'analytics_sessions' }),
      expect.any(String),
    )
  })
})
