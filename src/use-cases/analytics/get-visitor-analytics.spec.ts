import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { err, isErr, isOk } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { VisitorNotFoundError } from '@use-cases/errors/visitor-not-found-error'
import { GetVisitorAnalyticsUseCase } from './get-visitor-analytics'

let repository: InMemoryAnalyticsRepository
let useCase: GetVisitorAnalyticsUseCase

const REQUEST = { visitorId: 'visitor-1', pagesLimit: 50, visitsLimit: 50, cursor: null }

async function seedVisitorWithReading() {
  await repository.upsertVisitor({ visitorId: 'visitor-1' })
  await repository.upsertSession({ sessionId: 'session-1', visitorId: 'visitor-1' })
  await repository.createEvent({
    sessionId: 'session-1',
    eventType: 'page_exit',
    path: '/post',
    durationMs: 45_000,
    scrollDepth: 80,
  })
}

beforeEach(() => {
  repository = new InMemoryAnalyticsRepository()
  useCase = new GetVisitorAnalyticsUseCase(repository)
})

describe('GetVisitorAnalyticsUseCase', () => {
  it('returns the visitor, their reading and their visits together', async () => {
    await seedVisitorWithReading()

    const result = await useCase.execute(REQUEST)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.visitor.visitorId).toBe('visitor-1')
      expect(result.value.pagesRead).toHaveLength(1)
      expect(result.value.visits).toHaveLength(1)
    }
  })

  it('answers NOT FOUND for a visitor that does not exist', async () => {
    const result = await useCase.execute(REQUEST)

    // Distinct from "exists but read nothing": a dashboard that cannot tell them
    // apart shows a blank page for a mistyped id.
    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(VisitorNotFoundError)
  })

  it('returns empty sections for a visitor who exists but read nothing', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1' })

    const result = await useCase.execute(REQUEST)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.pagesRead).toEqual([])
      expect(result.value.visits).toEqual([])
    }
  })

  it('does not query pages or visits once the visitor is missing', async () => {
    let pagesQueried = false
    repository.findPagesRead = async () => {
      pagesQueried = true
      return err(new DatabaseQueryError(new Error('should not run')))
    }

    await useCase.execute(REQUEST)

    expect(pagesQueried).toBe(false)
  })

  it('propagates a failure reading the visitor', async () => {
    repository.findVisitorByVisitorId = async () => err(new DatabaseQueryError(new Error('boom')))

    expect(isErr(await useCase.execute(REQUEST))).toBe(true)
  })

  it('propagates a failure reading pages', async () => {
    await seedVisitorWithReading()
    repository.findPagesRead = async () => err(new DatabaseQueryError(new Error('boom')))

    expect(isErr(await useCase.execute(REQUEST))).toBe(true)
  })

  it('propagates a failure reading visits', async () => {
    await seedVisitorWithReading()
    repository.findVisits = async () => err(new DatabaseQueryError(new Error('boom')))

    expect(isErr(await useCase.execute(REQUEST))).toBe(true)
  })

  it('passes the cursor and limits through to the repository', async () => {
    await seedVisitorWithReading()
    const cursor = new Date('2026-01-01T00:00:00Z')
    let seen: unknown = null
    repository.findPagesRead = async (query) => {
      seen = query
      return { success: true, value: [] }
    }

    await useCase.execute({ visitorId: 'visitor-1', pagesLimit: 10, visitsLimit: 5, cursor })

    expect(seen).toEqual({ visitorId: 'visitor-1', limit: 10, cursor })
  })
})

describe('GetVisitorAnalyticsUseCase — byUser', () => {
  it('returns the visitors linked to a user', async () => {
    await repository.upsertVisitor({ visitorId: 'visitor-1', userId: 'user-1' })
    await repository.upsertVisitor({ visitorId: 'visitor-2', userId: 'user-1' })
    await repository.upsertVisitor({ visitorId: 'visitor-anon' })

    const result = await useCase.byUser('user-1', 50)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toHaveLength(2)
  })

  it('returns an empty list rather than failing for an unknown user', async () => {
    const result = await useCase.byUser('nobody', 50)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toEqual([])
  })

  it('propagates a repository failure', async () => {
    repository.findVisitorsByUserId = async () => err(new DatabaseQueryError(new Error('boom')))

    expect(isErr(await useCase.byUser('user-1', 50))).toBe(true)
  })
})
