import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { TrackAnalyticsUseCase } from './track-analytics'
import { describe, it, expect, beforeEach } from 'vitest'
import { err, isErr, isOk } from 'core/shared/result'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

let analyticsRepository: InMemoryAnalyticsRepository
let trackAnalyticsUseCase: TrackAnalyticsUseCase

beforeEach(() => {
  analyticsRepository = new InMemoryAnalyticsRepository()
  trackAnalyticsUseCase = new TrackAnalyticsUseCase(analyticsRepository)
})

describe('Track Analytics Use Case', () => {
  it('should be able to track a pageview session and save standard events', async () => {
    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
      ipAddress: '203.0.113.0',
      browser: 'Chrome',
      os: 'Windows',
      device: 'desktop',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'search',
    })

    expect(isOk(result)).toBe(true)
    expect(analyticsRepository.sessions).toHaveLength(1)
    expect(analyticsRepository.sessions[0].visitorId).toBe('visitor-1')
    expect(analyticsRepository.sessions[0].sessionId).toBe('session-1')
    expect(analyticsRepository.sessions[0].utmSource).toBe('google')
    expect(analyticsRepository.sessions[0].browser).toBe('Chrome')

    expect(analyticsRepository.events).toHaveLength(1)
    expect(analyticsRepository.events[0].sessionId).toBe('session-1')
    expect(analyticsRepository.events[0].eventType).toBe('page_view')
    expect(analyticsRepository.events[0].path).toBe('/churches')
  })

  it('creates the visitor before the session, since the session has a FK to it', async () => {
    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
    })

    expect(analyticsRepository.visitors).toHaveLength(1)
    expect(analyticsRepository.visitors[0].visitorId).toBe('visitor-1')
    expect(analyticsRepository.sessions[0].visitorId).toBe(analyticsRepository.visitors[0].visitorId)
  })

  it('should be able to handle subsequent events for the same session by updating/upserting the session', async () => {
    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
      ipAddress: '203.0.113.0',
    })

    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'click',
      path: '/churches/map-view',
      ipAddress: '203.0.113.0',
      payload: { elementId: 'btn-view-map' },
    })

    expect(isOk(result)).toBe(true)
    expect(analyticsRepository.visitors).toHaveLength(1)
    expect(analyticsRepository.sessions).toHaveLength(1)
    expect(analyticsRepository.events).toHaveLength(2)

    expect(analyticsRepository.events[1].eventType).toBe('click')
    expect(analyticsRepository.events[1].path).toBe('/churches/map-view')
    expect(analyticsRepository.events[1].payload).toEqual({ elementId: 'btn-view-map' })
  })

  it('preserves first-touch attribution when a later visit carries a different campaign', async () => {
    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/first-landing',
      utmSource: 'google',
      utmCampaign: 'acquisition',
    })

    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-2',
      eventType: 'page_view',
      path: '/second-landing',
      utmSource: 'newsletter',
      utmCampaign: 'retention',
    })

    const visitor = analyticsRepository.visitors[0]

    // The campaign that ACQUIRED the visitor must survive every later one — that
    // is the entire value of a first-touch column.
    expect(visitor.firstUtmSource).toBe('google')
    expect(visitor.firstUtmCampaign).toBe('acquisition')
    expect(visitor.firstLandingPath).toBe('/first-landing')

    // ...while the session records what actually happened this visit.
    const secondSession = analyticsRepository.sessions.find((s) => s.sessionId === 'session-2')
    expect(secondSession?.utmSource).toBe('newsletter')
  })

  it('carries the authenticated user through to visitor and session', async () => {
    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
      userId: 'user-public-id',
    })

    expect(analyticsRepository.visitors[0].userId).toBe('user-public-id')
    expect(analyticsRepository.sessions[0].userId).toBe('user-public-id')
  })

  it('records reading depth on the event', async () => {
    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_exit',
      path: '/post/algo',
      durationMs: 45_000,
      scrollDepth: 80,
    })

    expect(analyticsRepository.events[0].durationMs).toBe(45_000)
    expect(analyticsRepository.events[0].scrollDepth).toBe(80)
  })

  it('resolves to a void success, not to the created event', async () => {
    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
    })

    // The use-case's contract is Result<void, AppError>. Leaking the event row
    // would make a caller's `result.value` depend on a repository detail, and
    // `isOk` alone cannot tell the two apart.
    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBeUndefined()
  })
})

describe('Track Analytics Use Case — failure propagation', () => {
  const failure = err(new DatabaseQueryError(new Error('boom')))

  it('stops and propagates when the visitor upsert fails, writing nothing else', async () => {
    analyticsRepository.upsertVisitor = async () => failure

    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
    })

    expect(isErr(result)).toBe(true)
    expect(analyticsRepository.sessions).toHaveLength(0)
    expect(analyticsRepository.events).toHaveLength(0)
  })

  it('stops and propagates when the session upsert fails, writing no event', async () => {
    analyticsRepository.upsertSession = async () => failure

    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
    })

    expect(isErr(result)).toBe(true)
    expect(analyticsRepository.events).toHaveLength(0)
  })

  it('propagates a failure to create the event', async () => {
    analyticsRepository.createEvent = async () => failure

    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'page_view',
      path: '/churches',
    })

    expect(isErr(result)).toBe(true)
  })
})
