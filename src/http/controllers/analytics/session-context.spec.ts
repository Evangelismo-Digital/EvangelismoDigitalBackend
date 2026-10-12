/**
 * Unit coverage for the request-context helpers.
 *
 * These were reachable only through the e2e suite, which Stryker does not run —
 * so 23 mutants sat uncovered in a file that decides what personal data gets
 * persisted. The minimisation in here is the kind of thing that must not be
 * verifiable only by a Docker-backed test.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { analyticsResponseHeaders, sessionContext } from './session-context'

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

function makeRequest(
  overrides: { ip?: string; headers?: Record<string, string>; query?: Record<string, string> } = {},
): FastifyRequest {
  return {
    ip: overrides.ip ?? '203.0.113.42',
    headers: overrides.headers ?? {},
    query: overrides.query ?? {},
  } as unknown as FastifyRequest
}

describe('sessionContext — minimisation at the boundary', () => {
  it('stores the IP truncated, never whole', () => {
    const context = sessionContext(makeRequest({ ip: '203.0.113.42' }))

    expect(context.ipAddress).toBe('203.0.113.0')
    expect(context.ipAddress).not.toBe('203.0.113.42')
  })

  it('reads the address from request.ip, which honours trustProxy', () => {
    // Fastify computes request.ip through @fastify/proxy-addr. The helper this
    // replaced parsed X-Forwarded-For itself and so ignored the trust policy.
    const context = sessionContext(makeRequest({ ip: '198.51.100.7' }))

    expect(context.ipAddress).toBe('198.51.100.0')
  })

  it('answers null for an address it cannot read rather than storing it raw', () => {
    const context = sessionContext(makeRequest({ ip: 'not-an-address' }))

    expect(context.ipAddress).toBeNull()
  })

  it('stores the user-agent parsed, and keeps no raw string', () => {
    const context = sessionContext(makeRequest({ headers: { 'user-agent': CHROME_WIN } }))

    expect(context).toMatchObject({ browser: 'Chrome', os: 'Windows', device: 'desktop' })
    expect(Object.values(context)).not.toContain(CHROME_WIN)
    expect(context).not.toHaveProperty('userAgent')
  })

  it('is all-null for an absent user-agent', () => {
    const context = sessionContext(makeRequest())

    expect(context).toMatchObject({ browser: null, os: null, device: null })
  })
})

describe('sessionContext — language', () => {
  it('keeps only the first tag of Accept-Language', () => {
    const context = sessionContext(makeRequest({ headers: { 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' } }))

    expect(context.language).toBe('pt-BR')
  })

  it('trims surrounding whitespace', () => {
    const context = sessionContext(makeRequest({ headers: { 'accept-language': '  pt-BR  , en' } }))

    expect(context.language).toBe('pt-BR')
  })

  it('is null when the header is absent', () => {
    expect(sessionContext(makeRequest()).language).toBeNull()
  })

  it('is null for an empty header rather than an empty string', () => {
    expect(sessionContext(makeRequest({ headers: { 'accept-language': '' } })).language).toBeNull()
  })

  it('bounds an over-long value, since the header is attacker-controlled', () => {
    const context = sessionContext(makeRequest({ headers: { 'accept-language': 'x'.repeat(500) } }))

    // A BCP-47 tag is short; the cap exists because this lands in a column.
    expect(context.language).toHaveLength(35)
  })
})

describe('sessionContext — campaign parameters', () => {
  it('maps every UTM parameter from the query string', () => {
    const context = sessionContext(
      makeRequest({
        query: {
          utm_source: 'google',
          utm_medium: 'cpc',
          utm_campaign: 'lancamento',
          utm_term: 'evangelho',
          utm_content: 'banner-a',
        },
      }),
    )

    expect(context).toMatchObject({
      utmSource: 'google',
      utmMedium: 'cpc',
      utmCampaign: 'lancamento',
      utmTerm: 'evangelho',
      utmContent: 'banner-a',
    })
  })

  it('normalises absent parameters to null, not undefined', () => {
    const context = sessionContext(makeRequest())

    // `?? null` in the projection depends on this: undefined would leave a
    // previously-stored campaign in place instead of clearing it.
    expect(context).toMatchObject({
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
      utmTerm: null,
      utmContent: null,
    })
  })

  it('treats an empty parameter as absent', () => {
    const context = sessionContext(makeRequest({ query: { utm_source: '' } }))

    expect(context.utmSource).toBeNull()
  })

  it('does not confuse one parameter for another', () => {
    const context = sessionContext(makeRequest({ query: { utm_campaign: 'apenas-campanha' } }))

    expect(context.utmCampaign).toBe('apenas-campanha')
    expect(context.utmSource).toBeNull()
  })
})

describe('analyticsResponseHeaders', () => {
  function makeReply() {
    const reply = { header: vi.fn().mockReturnThis() }
    return reply as unknown as FastifyReply & typeof reply
  }

  it('forbids caching, because these responses carry Set-Cookie', () => {
    const reply = makeReply()

    analyticsResponseHeaders(reply)

    // A shared cache would otherwise hand one visitor's identity to the next
    // person through it.
    expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('sets Vary and nosniff', () => {
    const reply = makeReply()

    analyticsResponseHeaders(reply)

    expect(reply.header).toHaveBeenCalledWith('Vary', 'Origin')
    expect(reply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff')
  })

  it('sets exactly those three headers', () => {
    const reply = makeReply()

    analyticsResponseHeaders(reply)

    expect(reply.header).toHaveBeenCalledTimes(3)
  })
})
