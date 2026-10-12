/**
 * Behaviour of the in-memory double that the shared contract cannot express,
 * because it depends on the passage of time.
 *
 * Fake timers rather than a delay: a test that waits on a real clock fails under
 * load instead of on logic, which is worse than having no test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isOk } from 'core/shared/result'
import { InMemoryAnalyticsRepository } from './in-memory-analytics-repository'

let repository: InMemoryAnalyticsRepository

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T10:00:00Z'))
  repository = new InMemoryAnalyticsRepository()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('InMemoryAnalyticsRepository — activity clock', () => {
  it('moves lastSeenAt forward when a visitor is seen again', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    const firstSeen = repository.visitors[0].lastSeenAt

    vi.advanceTimersByTime(60_000)
    await repository.upsertVisitor({ visitorId: 'visitor-1' })

    expect(repository.visitors[0].lastSeenAt.getTime()).toBeGreaterThan(firstSeen.getTime())
  })

  it('leaves firstSeenAt where it was', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    const firstSeenAt = repository.visitors[0].firstSeenAt

    vi.advanceTimersByTime(60_000)
    await repository.upsertVisitor({ visitorId: 'visitor-1' })

    // "When did they first arrive" is the question this column answers; a
    // refresh here would silently make every visitor look new.
    expect(repository.visitors[0].firstSeenAt).toEqual(firstSeenAt)
  })

  it('moves a session lastSeenAt forward on each upsert, which is what the sliding window rests on', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
    const before = repository.sessions[0].lastSeenAt

    vi.advanceTimersByTime(60_000)
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

    expect(repository.sessions[0].lastSeenAt.getTime()).toBeGreaterThan(before.getTime())
  })

  it('leaves startedAt where it was', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
    const startedAt = repository.sessions[0].startedAt

    vi.advanceTimersByTime(60_000)
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

    expect(repository.sessions[0].startedAt).toEqual(startedAt)
  })

  it('stamps events with the time they occurred', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

    vi.advanceTimersByTime(120_000)
    const created = await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: '/x' })

    expect(isOk(created)).toBe(true)
    if (isOk(created)) expect(created.value.occurredAt).toEqual(new Date('2026-01-01T10:02:00Z'))
  })
})

/**
 * Retention boundary, at exactly the cutoff.
 *
 * Not in the shared contract because it cannot be expressed there: `lastSeenAt`
 * and `occurredAt` are database-managed, so only the double lets a row be placed
 * precisely on the line. The rule is "strictly older than the cutoff" — `<`, not
 * `<=` — and mutation testing showed the suite could not tell the two apart.
 */
describe('InMemoryAnalyticsRepository — retention boundary', () => {
  const CUTOFF = new Date('2026-01-01T10:00:00Z')

  it('keeps an event sitting exactly on the cutoff', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
    await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: '/a' })
    repository.events[0].occurredAt = new Date(CUTOFF)

    await repository.purgeEventsOlderThan(CUTOFF, 100)

    expect(repository.events).toHaveLength(1)
  })

  it('purges an event one millisecond older than the cutoff', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
    await repository.createEvent({ sessionId: 'session-1', eventType: 'click', path: '/a' })
    repository.events[0].occurredAt = new Date(CUTOFF.getTime() - 1)

    await repository.purgeEventsOlderThan(CUTOFF, 100)

    expect(repository.events).toHaveLength(0)
  })

  it('keeps a session sitting exactly on the cutoff', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
    repository.sessions[0].startedAt = new Date(CUTOFF)

    await repository.purgeSessionsOlderThan(CUTOFF, 100)

    expect(repository.sessions).toHaveLength(1)
  })

  it('keeps a visitor sitting exactly on the cutoff', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    repository.visitors[0].lastSeenAt = new Date(CUTOFF)

    await repository.purgeVisitorsInactiveSince(CUTOFF, 100)

    expect(repository.visitors).toHaveLength(1)
  })

  it('purges a visitor one millisecond older than the cutoff', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    repository.visitors[0].lastSeenAt = new Date(CUTOFF.getTime() - 1)

    await repository.purgeVisitorsInactiveSince(CUTOFF, 100)

    expect(repository.visitors).toHaveLength(0)
  })
})

/**
 * Ordering of the dashboard reads — newest first, in all three.
 *
 * Not in the shared contract because it needs timestamps set precisely: rows
 * inserted back-to-back can land in the same millisecond, and an ordering
 * assertion over ties is a flaky test rather than a strict one. Mutation testing
 * found every one of these unasserted — deleting the `sort` entirely survived
 * the whole suite, and a dashboard silently showing a visitor's history in
 * arbitrary order is the kind of bug nobody reports as a bug.
 */
describe('InMemoryAnalyticsRepository — read ordering', () => {
  const T = (iso: string) => new Date(iso)

  async function seedThreeReads() {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })

    for (const path of ['/antigo', '/meio', '/novo']) {
      await repository.createEvent({ sessionId: 'session-1', eventType: 'page_exit', path, durationMs: 1000 })
    }

    repository.events[0].occurredAt = T('2026-01-01T10:00:00Z')
    repository.events[1].occurredAt = T('2026-02-01T10:00:00Z')
    repository.events[2].occurredAt = T('2026-03-01T10:00:00Z')
  }

  it('returns pages read newest first', async () => {
    await seedThreeReads()

    const pages = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 10, cursor: null })

    if (isOk(pages)) expect(pages.value.map((e) => e.path)).toEqual(['/novo', '/meio', '/antigo'])
  })

  it('takes the NEWEST pages when the limit truncates', async () => {
    await seedThreeReads()

    const pages = await repository.findPagesRead({ visitorId: 'visitor-1', limit: 2, cursor: null })

    // Sorting after slicing, or slicing an unsorted list, would return an
    // arbitrary two — the limit must cut the oldest, never the newest.
    if (isOk(pages)) expect(pages.value.map((e) => e.path)).toEqual(['/novo', '/meio'])
  })

  it('excludes rows at or after the cursor', async () => {
    await seedThreeReads()

    const pages = await repository.findPagesRead({
      visitorId: 'visitor-1',
      limit: 10,
      cursor: T('2026-02-01T10:00:00Z'),
    })

    // Strictly older: the cursor row itself was already returned on the previous
    // page, so `<=` here would serve it twice.
    if (isOk(pages)) expect(pages.value.map((e) => e.path)).toEqual(['/antigo'])
  })

  it('returns visits newest first', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'antiga', visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'nova', visitorId: 'visitor-1' })
    repository.sessions[0].startedAt = T('2026-01-01T10:00:00Z')
    repository.sessions[1].startedAt = T('2026-03-01T10:00:00Z')

    const visits = await repository.findVisits('visitor-1', 10)

    if (isOk(visits)) expect(visits.value.map((s) => s.sessionId)).toEqual(['nova', 'antiga'])
  })

  it('takes the most recent visits when the limit truncates', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'antiga', visitorId: 'visitor-1' })
    await repository.upsertSession({ sessionId: 'nova', visitorId: 'visitor-1' })
    repository.sessions[0].startedAt = T('2026-01-01T10:00:00Z')
    repository.sessions[1].startedAt = T('2026-03-01T10:00:00Z')

    const visits = await repository.findVisits('visitor-1', 1)

    if (isOk(visits)) expect(visits.value.map((s) => s.sessionId)).toEqual(['nova'])
  })

  it('returns a user’s visitors most-recently-seen first', async () => {
    await repository.upsertVisitor({ visitorId: 'antigo', userId: 'user-1' })
    await repository.upsertVisitor({ visitorId: 'recente', userId: 'user-1' })
    repository.visitors[0].lastSeenAt = T('2026-01-01T10:00:00Z')
    repository.visitors[1].lastSeenAt = T('2026-03-01T10:00:00Z')

    const found = await repository.findVisitorsByUserId('user-1', 10)

    if (isOk(found)) expect(found.value.map((v) => v.visitorId)).toEqual(['recente', 'antigo'])
  })

  it('takes the most recent visitors when the limit truncates', async () => {
    await repository.upsertVisitor({ visitorId: 'antigo', userId: 'user-1' })
    await repository.upsertVisitor({ visitorId: 'recente', userId: 'user-1' })
    repository.visitors[0].lastSeenAt = T('2026-01-01T10:00:00Z')
    repository.visitors[1].lastSeenAt = T('2026-03-01T10:00:00Z')

    const found = await repository.findVisitorsByUserId('user-1', 1)

    if (isOk(found)) expect(found.value.map((v) => v.visitorId)).toEqual(['recente'])
  })
})
