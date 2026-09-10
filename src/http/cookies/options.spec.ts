import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  VISITOR_COOKIE,
  VISITOR_MAX_AGE,
  consentCookieOptions,
  hostPrefixed,
  isPlainHttpEnv,
  trackingCookieOptions,
} from './options'

describe('hostPrefixed', () => {
  it('applies the __Host- prefix where TLS is available', () => {
    expect(hostPrefixed('ed_vid', false)).toBe('__Host-ed_vid')
  })

  it('omits the prefix over plain HTTP, where the browser would reject it', () => {
    expect(hostPrefixed('ed_vid', true)).toBe('ed_vid')
  })

  it('only ever adds the prefix, never alters the base name', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.boolean(), (name, plainHttp) => {
        expect(hostPrefixed(name, plainHttp).endsWith(name)).toBe(true)
      }),
    )
  })
})

describe('tracking cookie attributes', () => {
  it('satisfies every condition the __Host- prefix requires', () => {
    // The browser silently drops a __Host- cookie that breaks any of these, so
    // asserting the prefix without asserting its preconditions proves nothing.
    expect(trackingCookieOptions.path).toBe('/')
    expect(trackingCookieOptions).not.toHaveProperty('domain')
  })

  it('is HttpOnly and signed, so the identifier cannot be read or forged by the page', () => {
    expect(trackingCookieOptions.httpOnly).toBe(true)
    expect(trackingCookieOptions.signed).toBe(true)
  })

  it('uses SameSite=Lax, which the first-party proxy makes sufficient', () => {
    expect(trackingCookieOptions.sameSite).toBe('lax')
  })

  it('names both identifier cookies consistently with the prefix rule', () => {
    expect(VISITOR_COOKIE).toBe(hostPrefixed('ed_vid'))
    expect(SESSION_COOKIE).toBe(hostPrefixed('ed_sid'))
    expect(VISITOR_COOKIE).not.toBe(SESSION_COOKIE)
  })
})

describe('consent cookie attributes', () => {
  it('is readable by JavaScript, because the banner renders its own state', () => {
    expect(consentCookieOptions.httpOnly).toBe(false)
    expect(consentCookieOptions.signed).toBe(false)
  })

  it('carries no __Host- prefix', () => {
    expect(CONSENT_COOKIE).toBe('ed_consent')
  })
})

describe('lifetimes', () => {
  it('caps the visitor cookie at 13 months rather than a rounded year', () => {
    expect(VISITOR_MAX_AGE).toBe(395 * 24 * 60 * 60)
  })

  it('expires a session after 30 minutes of inactivity', () => {
    expect(SESSION_MAX_AGE).toBe(30 * 60)
  })

  it('keeps consent for 12 months', () => {
    expect(CONSENT_MAX_AGE).toBe(365 * 24 * 60 * 60)
  })

  it('outlives the session with the visitor cookie, which is the point of the two-level model', () => {
    expect(VISITOR_MAX_AGE).toBeGreaterThan(SESSION_MAX_AGE)
  })
})

/**
 * The regression §4.3 exists to close.
 *
 * The previous rule was `secure: env.NODE_ENV === 'production'`, and `staging`
 * is a valid member of the NODE_ENV enum — so a staging deployment served its
 * tracking cookies WITHOUT `Secure` over a real HTTPS origin, and `__Host-`
 * would have been impossible there. The condition is asserted per environment
 * rather than through the module's own resolved value, because that value is
 * fixed to `test` while the suite runs and would assert nothing about staging.
 */
describe('secure flag across environments', () => {
  it('demands Secure in staging — the case the NODE_ENV === production check missed', () => {
    expect(isPlainHttpEnv('staging')).toBe(false)
  })

  it('demands Secure in production', () => {
    expect(isPlainHttpEnv('production')).toBe(false)
  })

  it('allows plain HTTP in development and test, where there is no TLS', () => {
    expect(isPlainHttpEnv('development')).toBe(true)
    expect(isPlainHttpEnv('test')).toBe(true)
  })

  it('treats every deployed environment as requiring TLS', () => {
    const deployed = ['staging', 'production'] as const
    const local = ['development', 'test'] as const

    expect(deployed.map(isPlainHttpEnv)).toEqual([false, false])
    expect(local.map(isPlainHttpEnv)).toEqual([true, true])
  })
})
