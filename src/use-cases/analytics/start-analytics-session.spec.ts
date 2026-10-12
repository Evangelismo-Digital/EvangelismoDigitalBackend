import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { err, isErr, isOk } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { StartAnalyticsSessionUseCase } from './start-analytics-session'

let repository: InMemoryAnalyticsRepository
let useCase: StartAnalyticsSessionUseCase

const BASE = {
  visitorId: 'visitor-1',
  sessionId: 'session-1',
  isNewVisitor: true,
  isNewSession: true,
}

beforeEach(() => {
  repository = new InMemoryAnalyticsRepository()
  useCase = new StartAnalyticsSessionUseCase(repository)
})

describe('StartAnalyticsSessionUseCase', () => {
  it('creates the visitor and the session', async () => {
    const result = await useCase.execute(BASE)

    expect(isOk(result)).toBe(true)
    // Void, not the session row — see the note in identify-visitor.spec.ts.
    if (isOk(result)) expect(result.value).toBeUndefined()
    expect(repository.visitors).toHaveLength(1)
    expect(repository.sessions).toHaveLength(1)
  })

  it('records first-touch attribution and the landing path', async () => {
    await useCase.execute({ ...BASE, utmSource: 'google', utmCampaign: 'lancamento', landingPath: '/post/um' })

    expect(repository.visitors[0].firstUtmSource).toBe('google')
    expect(repository.visitors[0].firstUtmCampaign).toBe('lancamento')
    expect(repository.visitors[0].firstLandingPath).toBe('/post/um')
  })
})

describe('StartAnalyticsSessionUseCase — session counting', () => {
  it("does not double-count a new visitor's first session", async () => {
    await useCase.execute({ ...BASE, isNewVisitor: true, isNewSession: true })

    // The row is created with sessionCount 1 — incrementing as well would make
    // every brand-new visitor look like a returning one.
    expect(repository.visitors[0].sessionCount).toBe(1)
  })

  it('increments when a RETURNING visitor starts a new session', async () => {
    await useCase.execute({ ...BASE, isNewVisitor: true, isNewSession: true })
    await useCase.execute({ ...BASE, sessionId: 'session-2', isNewVisitor: false, isNewSession: true })

    expect(repository.visitors[0].sessionCount).toBe(2)
  })

  it('does NOT increment when an existing session is merely refreshed', async () => {
    await useCase.execute({ ...BASE, isNewVisitor: true, isNewSession: true })
    await useCase.execute({ ...BASE, isNewVisitor: false, isNewSession: false })
    await useCase.execute({ ...BASE, isNewVisitor: false, isNewSession: false })

    // The frontend calls /session on every page load. Counting those would turn
    // "how often do they come back" into "how many pages did they open".
    expect(repository.visitors[0].sessionCount).toBe(1)
  })

  it('counts a returning visitor across several distinct visits', async () => {
    await useCase.execute({ ...BASE, isNewVisitor: true, isNewSession: true })

    for (let visit = 2; visit <= 5; visit++) {
      await useCase.execute({
        ...BASE,
        sessionId: `session-${visit}`,
        isNewVisitor: false,
        isNewSession: true,
      })
    }

    expect(repository.visitors[0].sessionCount).toBe(5)
    expect(repository.sessions).toHaveLength(5)
  })
})

describe('StartAnalyticsSessionUseCase — failure propagation', () => {
  const failure = err(new DatabaseQueryError(new Error('boom')))

  it('writes no session when the visitor upsert fails', async () => {
    repository.upsertVisitor = async () => failure

    const result = await useCase.execute(BASE)

    expect(isErr(result)).toBe(true)
    expect(repository.sessions).toHaveLength(0)
  })

  it('propagates a session failure', async () => {
    repository.upsertSession = async () => failure

    expect(isErr(await useCase.execute(BASE))).toBe(true)
  })
})
