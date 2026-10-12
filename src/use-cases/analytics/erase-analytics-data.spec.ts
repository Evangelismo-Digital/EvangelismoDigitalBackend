import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { err, isErr, isOk } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { EraseAnalyticsDataUseCase } from './erase-analytics-data'

let repository: InMemoryAnalyticsRepository
let useCase: EraseAnalyticsDataUseCase

const USER = 'user-public-id'

async function seedVisit(visitorId: string, sessionId: string, userId?: string) {
  await repository.upsertVisitor({ visitorId, userId })
  await repository.upsertSession({ sessionId, visitorId, userId })
  await repository.createEvent({ sessionId, eventType: 'page_view', path: '/post' })
}

beforeEach(() => {
  repository = new InMemoryAnalyticsRepository()
  useCase = new EraseAnalyticsDataUseCase(repository)
})

describe('EraseAnalyticsDataUseCase — byVisitor (consent revocation)', () => {
  it('erases the visitor and everything hanging off them', async () => {
    await seedVisit('visitor-1', 'session-1')

    const result = await useCase.byVisitor('visitor-1')

    expect(isOk(result)).toBe(true)
    expect(repository.visitors).toHaveLength(0)
    expect(repository.sessions).toHaveLength(0)
    expect(repository.events).toHaveLength(0)
  })

  it('reports how many visitors were erased', async () => {
    await seedVisit('visitor-1', 'session-1')

    const result = await useCase.byVisitor('visitor-1')

    if (isOk(result)) expect(result.value).toBe(1)
  })

  it('treats erasing an untracked visitor as success', async () => {
    const result = await useCase.byVisitor('never-existed')

    // Someone who never consented revoking consent is the ordinary case; it must
    // not surface as an error to a caller who can do nothing about it.
    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe(0)
  })

  it('leaves other visitors intact', async () => {
    await seedVisit('visitor-1', 'session-1')
    await seedVisit('visitor-2', 'session-2')

    await useCase.byVisitor('visitor-1')

    expect(repository.visitors).toHaveLength(1)
    expect(repository.visitors[0].visitorId).toBe('visitor-2')
    expect(repository.events).toHaveLength(1)
  })

  it('propagates a repository failure', async () => {
    repository.deleteVisitorData = async () => err(new DatabaseQueryError(new Error('boom')))

    expect(isErr(await useCase.byVisitor('visitor-1'))).toBe(true)
  })
})

describe('EraseAnalyticsDataUseCase — byUser (right to erasure)', () => {
  it('erases every browser the user was linked to', async () => {
    await seedVisit('visitor-1', 'session-1', USER)
    await seedVisit('visitor-2', 'session-2', USER)

    const result = await useCase.byUser(USER)

    if (isOk(result)) expect(result.value).toBe(2)
    expect(repository.visitors).toHaveLength(0)
  })

  it('never touches another user’s record', async () => {
    await seedVisit('visitor-1', 'session-1', USER)
    await seedVisit('visitor-2', 'session-2', 'outro-usuario')

    await useCase.byUser(USER)

    expect(repository.visitors).toHaveLength(1)
    expect(repository.visitors[0].userId).toBe('outro-usuario')
  })

  it('leaves anonymous visitors alone', async () => {
    await seedVisit('visitor-1', 'session-1', USER)
    await seedVisit('visitor-anon', 'session-anon')

    await useCase.byUser(USER)

    expect(repository.visitors).toHaveLength(1)
    expect(repository.visitors[0].visitorId).toBe('visitor-anon')
  })

  it('succeeds when the user has no analytics record', async () => {
    const result = await useCase.byUser(USER)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBe(0)
  })

  it('propagates a repository failure', async () => {
    repository.deleteDataForUser = async () => err(new DatabaseQueryError(new Error('boom')))

    expect(isErr(await useCase.byUser(USER))).toBe(true)
  })
})
