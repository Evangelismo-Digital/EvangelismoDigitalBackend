import { describe, expect, it } from 'vitest'
import {
  IAnalyticsEvent,
  IAnalyticsSession,
  IAnalyticsVisitor,
} from 'core/contracts/repository/analytics-repository.interface'
import { AnalyticsPresenter } from './analytics-presenter'

function makeVisitor(overrides: Partial<IAnalyticsVisitor> = {}): IAnalyticsVisitor {
  return {
    id: 'row-1',
    visitorId: 'visitor-1',
    firstSeenAt: new Date('2026-01-01T10:00:00Z'),
    lastSeenAt: new Date('2026-02-01T10:00:00Z'),
    sessionCount: 3,
    firstUtmSource: 'google',
    firstUtmMedium: 'cpc',
    firstUtmCampaign: 'lancamento',
    firstLandingPath: '/inicio',
    userId: null,
    ...overrides,
  }
}

function makeSession(overrides: Partial<IAnalyticsSession> = {}): IAnalyticsSession {
  return {
    id: 'row-1',
    sessionId: 'session-1',
    visitorId: 'visitor-1',
    userId: null,
    startedAt: new Date('2026-01-01T10:00:00Z'),
    lastSeenAt: new Date('2026-01-01T10:30:00Z'),
    endedAt: null,
    durationMs: 1_800_000,
    ipAddress: '203.0.113.0',
    country: 'BR',
    region: 'SP',
    city: 'São Paulo',
    browser: 'Chrome',
    os: 'Windows',
    device: 'desktop',
    language: 'pt-BR',
    referrer: null,
    landingPath: '/inicio',
    exitPath: '/post',
    pageViewCount: 4,
    eventCount: 9,
    isBounce: false,
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: 'lancamento',
    utmTerm: null,
    utmContent: null,
    ...overrides,
  }
}

function makeEvent(overrides: Partial<IAnalyticsEvent> = {}): IAnalyticsEvent {
  return {
    id: 'row-1',
    sessionId: 'session-1',
    eventType: 'page_exit',
    path: '/post/um',
    title: 'Um post',
    referrer: '/inicio',
    durationMs: 45_000,
    scrollDepth: 80,
    payload: null,
    occurredAt: new Date('2026-01-01T10:20:00Z'),
    ...overrides,
  }
}

describe('AnalyticsPresenter — minimisation at the boundary', () => {
  it('never exposes the IP address, truncated though it is', () => {
    const [visit] = AnalyticsPresenter.visitsToHTTP([makeSession()])

    // §5.2 keeps a /24 for city-level geolocation, not for display. Handing it
    // to an operator's browser would undo the minimisation the ingestion path
    // went to the trouble of applying.
    expect(visit).not.toHaveProperty('ipAddress')
  })

  it('exposes no raw user-agent, because none is stored', () => {
    const [visit] = AnalyticsPresenter.visitsToHTTP([makeSession()])

    expect(visit).not.toHaveProperty('userAgent')
    expect(visit.browser).toBe('Chrome')
    expect(visit.os).toBe('Windows')
  })

  it('does not leak the internal row id', () => {
    expect(AnalyticsPresenter.visitorToHTTP(makeVisitor())).not.toHaveProperty('id')
    expect(AnalyticsPresenter.visitsToHTTP([makeSession()])[0]).not.toHaveProperty('id')
    expect(AnalyticsPresenter.pagesReadToHTTP([makeEvent()])[0]).not.toHaveProperty('id')
  })

  it('does not expose event payloads, which are caller-supplied', () => {
    const [page] = AnalyticsPresenter.pagesReadToHTTP([makeEvent({ payload: { segredo: 'x' } })])

    expect(page).not.toHaveProperty('payload')
  })
})

describe('AnalyticsPresenter — visitor', () => {
  it('answers when they first arrived and when they came back', () => {
    const presented = AnalyticsPresenter.visitorToHTTP(makeVisitor())

    expect(presented.firstSeenAt).toEqual(new Date('2026-01-01T10:00:00Z'))
    expect(presented.lastSeenAt).toEqual(new Date('2026-02-01T10:00:00Z'))
    expect(presented.sessionCount).toBe(3)
  })

  it('carries first-touch attribution', () => {
    const presented = AnalyticsPresenter.visitorToHTTP(makeVisitor())

    expect(presented.firstUtmSource).toBe('google')
    expect(presented.firstLandingPath).toBe('/inicio')
  })
})

describe('AnalyticsPresenter — pages read', () => {
  it('carries the reading measurements', () => {
    const [page] = AnalyticsPresenter.pagesReadToHTTP([makeEvent()])

    expect(page.durationMs).toBe(45_000)
    expect(page.scrollDepth).toBe(80)
    expect(page.path).toBe('/post/um')
    expect(page.title).toBe('Um post')
  })

  it('maps an empty list to an empty list', () => {
    expect(AnalyticsPresenter.pagesReadToHTTP([])).toEqual([])
  })
})

describe('AnalyticsPresenter — visits and their spacing', () => {
  const newest = makeSession({ sessionId: 's3', startedAt: new Date('2026-03-01T10:00:00Z') })
  const middle = makeSession({ sessionId: 's2', startedAt: new Date('2026-02-01T10:00:00Z') })
  const oldest = makeSession({ sessionId: 's1', startedAt: new Date('2026-01-01T10:00:00Z') })

  it('attaches the previous visit to each visit', () => {
    const visits = AnalyticsPresenter.visitsToHTTP([newest, middle, oldest])

    // Rows arrive newest-first, so the previous visit is simply the next
    // element — the window function §6's SQL used is unnecessary here, and
    // doing it once stops every client reimplementing it.
    expect(visits[0].previousVisitAt).toEqual(middle.startedAt)
    expect(visits[1].previousVisitAt).toEqual(oldest.startedAt)
  })

  it('leaves the earliest visit with no predecessor', () => {
    const visits = AnalyticsPresenter.visitsToHTTP([newest, middle, oldest])

    expect(visits[2].previousVisitAt).toBeNull()
  })

  it('handles a single visit', () => {
    const visits = AnalyticsPresenter.visitsToHTTP([newest])

    expect(visits).toHaveLength(1)
    expect(visits[0].previousVisitAt).toBeNull()
  })

  it('maps an empty list to an empty list', () => {
    expect(AnalyticsPresenter.visitsToHTTP([])).toEqual([])
  })

  it('carries bounce and page-count context', () => {
    const [visit] = AnalyticsPresenter.visitsToHTTP([makeSession()])

    expect(visit.isBounce).toBe(false)
    expect(visit.pageViewCount).toBe(4)
    expect(visit.exitPath).toBe('/post')
  })
})
