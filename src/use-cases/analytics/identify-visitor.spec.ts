import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { err, isErr, isOk } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { IdentifyVisitorUseCase } from './identify-visitor'

let repository: InMemoryAnalyticsRepository
let useCase: IdentifyVisitorUseCase

const USER = 'user-public-id'

async function seedVisit(visitorId: string, sessionId: string) {
  await repository.upsertVisitor({ visitorId })
  await repository.upsertSession({ sessionId, visitorId })
}

beforeEach(() => {
  repository = new InMemoryAnalyticsRepository()
  useCase = new IdentifyVisitorUseCase(repository)
})

describe('IdentifyVisitorUseCase', () => {
  it('links the visitor to the user', async () => {
    await seedVisit('visitor-1', 'session-1')

    const result = await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      userId: USER,
      backfillEarlierSessions: false,
    })

    expect(isOk(result)).toBe(true)
    // Void, not the row count: leaking the repository's return would make a
    // caller's `result.value` depend on a storage detail, and `isOk` alone
    // cannot tell the two apart.
    if (isOk(result)) expect(result.value).toBeUndefined()
    expect(repository.visitors[0].userId).toBe(USER)
  })

  it('links the session in progress', async () => {
    await seedVisit('visitor-1', 'session-1')

    await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      userId: USER,
      backfillEarlierSessions: false,
    })

    expect(repository.sessions[0].userId).toBe(USER)
  })

  it('leaves earlier sessions anonymous when backfill is off', async () => {
    await seedVisit('visitor-1', 'session-old')
    await repository.upsertSession({ sessionId: 'session-current', visitorId: 'visitor-1' })

    await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-current',
      userId: USER,
      backfillEarlierSessions: false,
    })

    expect(repository.sessions.find((s) => s.sessionId === 'session-old')?.userId).toBeNull()
    expect(repository.sessions.find((s) => s.sessionId === 'session-current')?.userId).toBe(USER)
  })

  it('claims earlier sessions when backfill is on', async () => {
    await seedVisit('visitor-1', 'session-old')
    await repository.upsertSession({ sessionId: 'session-current', visitorId: 'visitor-1' })

    await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-current',
      userId: USER,
      backfillEarlierSessions: true,
    })

    expect(repository.sessions.every((s) => s.userId === USER)).toBe(true)
  })

  it('never claims sessions belonging to another visitor', async () => {
    await seedVisit('visitor-1', 'session-1')
    await seedVisit('visitor-2', 'session-2')

    await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      userId: USER,
      backfillEarlierSessions: true,
    })

    expect(repository.sessions.find((s) => s.sessionId === 'session-2')?.userId).toBeNull()
  })

  it('does not steal a session already claimed by a different account', async () => {
    await seedVisit('visitor-1', 'session-other-user')
    await repository.linkSessionsToUser({
      visitorId: 'visitor-1',
      sessionId: 'session-other-user',
      userId: 'someone-else',
      backfillEarlierSessions: false,
    })
    await repository.upsertSession({ sessionId: 'session-current', visitorId: 'visitor-1' })

    await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-current',
      userId: USER,
      backfillEarlierSessions: true,
    })

    // A shared browser: the backfill sweep must not reassign a visit that
    // another account already owns.
    expect(repository.sessions.find((s) => s.sessionId === 'session-other-user')?.userId).toBe('someone-else')
  })

  it('still links the visitor when no session cookie was presented', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })

    const result = await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: null,
      userId: USER,
      backfillEarlierSessions: false,
    })

    expect(isOk(result)).toBe(true)
    expect(repository.visitors[0].userId).toBe(USER)
  })

  it('claims nothing when there is no session and no backfill', async () => {
    await seedVisit('visitor-1', 'session-1')

    await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: null,
      userId: USER,
      backfillEarlierSessions: false,
    })

    // A null sessionId must match NOTHING, not everything — the failure mode
    // this guards is a filter that silently widens to every row.
    expect(repository.sessions[0].userId).toBeNull()
  })
})

describe('IdentifyVisitorUseCase — failure propagation', () => {
  const failure = err(new DatabaseQueryError(new Error('boom')))

  it('propagates a visitor failure without linking sessions', async () => {
    await seedVisit('visitor-1', 'session-1')
    repository.upsertVisitor = async () => failure

    const result = await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      userId: USER,
      backfillEarlierSessions: false,
    })

    expect(isErr(result)).toBe(true)
    expect(repository.sessions[0].userId).toBeNull()
  })

  it('propagates a session-link failure', async () => {
    await seedVisit('visitor-1', 'session-1')
    repository.linkSessionsToUser = async () => failure

    const result = await useCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      userId: USER,
      backfillEarlierSessions: false,
    })

    expect(isErr(result)).toBe(true)
  })
})
