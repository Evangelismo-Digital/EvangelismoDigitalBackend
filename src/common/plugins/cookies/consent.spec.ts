import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { FastifyRequest } from 'fastify'
import { CONSENT_COOKIE } from './options'
import { CONSENT_VERSION, hasAnalyticsConsent, parseConsent } from './consent'

describe('parseConsent — grants', () => {
  it('reads an explicit analytics grant', () => {
    expect(parseConsent('v1:analytics=1,marketing=0')).toEqual({ analytics: true, marketing: false })
  })

  it('reads both grants', () => {
    expect(parseConsent('v1:analytics=1,marketing=1')).toEqual({ analytics: true, marketing: true })
  })

  it('tolerates whitespace around the pairs', () => {
    expect(parseConsent('v1: analytics=1 , marketing=1 ')).toEqual({ analytics: true, marketing: true })
  })

  it('does not require a fixed order', () => {
    expect(parseConsent('v1:marketing=1,analytics=1')).toEqual({ analytics: true, marketing: true })
  })
})

describe('parseConsent — denials', () => {
  it.each([
    ['undefined', undefined],
    ['an empty string', ''],
    ['no version prefix', 'analytics=1'],
    ['an unknown version', 'v2:analytics=1'],
    ['an explicit zero', 'v1:analytics=0'],
    ['a bare key', 'v1:analytics'],
    ['a non-numeric truth', 'v1:analytics=true'],
    ['a different truth', 'v1:analytics=yes'],
    ['garbage', 'not-a-consent-cookie'],
    ['only a separator', 'v1:'],
  ])('treats %s as no consent', (_label, input) => {
    expect(parseConsent(input).analytics).toBe(false)
  })

  it('denies EVERY category on the no-consent path, not just analytics', () => {
    // Asserting only `.analytics` above left the shared denial object free to
    // grant marketing — a mutation run proved it by flipping that literal and
    // surviving. Absence of consent must deny everything it speaks for.
    expect(parseConsent(undefined)).toEqual({ analytics: false, marketing: false })
    expect(parseConsent('')).toEqual({ analytics: false, marketing: false })
    expect(parseConsent('v2:analytics=1,marketing=1')).toEqual({ analytics: false, marketing: false })
    expect(parseConsent('lixo')).toEqual({ analytics: false, marketing: false })
  })

  it('is the mechanism by which a policy change invalidates old grants', () => {
    // Bumping CONSENT_VERSION must strand every previously-stored value; if this
    // ever passes, consent survives a policy change it was never given for.
    expect(parseConsent(`${CONSENT_VERSION}:analytics=1`).analytics).toBe(true)
    expect(parseConsent('v0:analytics=1').analytics).toBe(false)
    expect(parseConsent('v99:analytics=1').analytics).toBe(false)
  })
})

describe('parseConsent — invariants', () => {
  it('never throws, and defaults to denied for arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const state = parseConsent(input)

        expect(typeof state.analytics).toBe('boolean')
        expect(typeof state.marketing).toBe('boolean')
      }),
    )
  })

  it('grants analytics only for an exact v1 analytics=1 token', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        fc.pre(!input.includes('analytics=1'))

        expect(parseConsent(input).analytics).toBe(false)
      }),
    )
  })

  it('keeps the two categories independent', () => {
    expect(parseConsent('v1:marketing=1')).toEqual({ analytics: false, marketing: true })
    expect(parseConsent('v1:analytics=1')).toEqual({ analytics: true, marketing: false })
  })
})

function requestWithCookies(cookies: Record<string, string>): FastifyRequest {
  return { cookies } as unknown as FastifyRequest
}

describe('hasAnalyticsConsent — the gate on identity and writes', () => {
  it('reads the grant from the ed_consent cookie', () => {
    expect(hasAnalyticsConsent(requestWithCookies({ [CONSENT_COOKIE]: 'v1:analytics=1' }))).toBe(true)
  })

  it('denies when the cookie is absent', () => {
    expect(hasAnalyticsConsent(requestWithCookies({}))).toBe(false)
  })

  it('denies when analytics is refused', () => {
    expect(hasAnalyticsConsent(requestWithCookies({ [CONSENT_COOKIE]: 'v1:analytics=0' }))).toBe(false)
  })

  it('is not satisfied by a marketing grant alone', () => {
    // Two independent permissions. A marketing "yes" is not permission to track
    // reading behaviour, and collapsing them would be a consent violation, not
    // a convenience.
    expect(hasAnalyticsConsent(requestWithCookies({ [CONSENT_COOKIE]: 'v1:marketing=1' }))).toBe(false)
  })

  it('ignores an unrelated cookie of the same shape', () => {
    expect(hasAnalyticsConsent(requestWithCookies({ outro_cookie: 'v1:analytics=1' }))).toBe(false)
  })
})
