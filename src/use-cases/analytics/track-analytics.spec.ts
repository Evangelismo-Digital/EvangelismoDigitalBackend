import { InMemoryAnalyticsRepository } from '@repositories/in-memory/in-memory-analytics-repository'
import { TrackAnalyticsUseCase } from './track-analytics'
import { describe, it, expect } from 'vitest'
import { isOk } from 'core/shared/result'

describe('Track Analytics Use Case', () => {
  it('should be able to track a pageview session and save standard events', async () => {
    const analyticsRepository = new InMemoryAnalyticsRepository()
    const trackAnalyticsUseCase = new TrackAnalyticsUseCase(analyticsRepository)

    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'pageview',
      path: '/churches',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'search',
    })

    expect(isOk(result)).toBe(true)
    expect(analyticsRepository.sessions).toHaveLength(1)
    expect(analyticsRepository.sessions[0].visitorId).toBe('visitor-1')
    expect(analyticsRepository.sessions[0].sessionId).toBe('session-1')
    expect(analyticsRepository.sessions[0].utmSource).toBe('google')

    expect(analyticsRepository.events).toHaveLength(1)
    expect(analyticsRepository.events[0].sessionId).toBe('session-1')
    expect(analyticsRepository.events[0].eventType).toBe('pageview')
    expect(analyticsRepository.events[0].path).toBe('/churches')
  })

  it('should be able to handle subsequent events for the same session by updating/upserting the session', async () => {
    const analyticsRepository = new InMemoryAnalyticsRepository()
    const trackAnalyticsUseCase = new TrackAnalyticsUseCase(analyticsRepository)

    // First event (pageview)
    await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'pageview',
      path: '/churches',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    })

    // Second event (custom click event)
    const result = await trackAnalyticsUseCase.execute({
      visitorId: 'visitor-1',
      sessionId: 'session-1',
      eventType: 'click',
      path: '/churches/map-view',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      payload: { elementId: 'btn-view-map' },
    })

    expect(isOk(result)).toBe(true)
    expect(analyticsRepository.sessions).toHaveLength(1)
    expect(analyticsRepository.events).toHaveLength(2)

    expect(analyticsRepository.events[1].eventType).toBe('click')
    expect(analyticsRepository.events[1].path).toBe('/churches/map-view')
    expect(analyticsRepository.events[1].payload).toEqual({ elementId: 'btn-view-map' })
  })
})
