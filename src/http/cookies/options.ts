import { env, type Env } from '@env/index'
import { DAYS_PER_YEAR, SECONDS_PER_DAY, SECONDS_PER_MINUTE } from 'core/constants/time'

/**
 * Single source of truth for every analytics cookie: names, lifetimes and
 * attributes. These used to live inline in the analytics plugin, where the
 * visitor and session cookies were configured by two copies of the same object
 * literal — so hardening one could silently miss the other.
 */

/**
 * `Secure` is refused by the browser over plain HTTP, and `__Host-` requires it.
 *
 * The check this replaces was `NODE_ENV === 'production'`, which left `staging`
 * — a valid value of the enum in `src/env/index.ts` — serving cookies WITHOUT
 * `Secure` over a real HTTPS origin. Inverting the test so it names the two
 * environments that genuinely lack TLS closes that, and stays correct if another
 * deployed environment is added later.
 */
export function isPlainHttpEnv(nodeEnv: Env['NODE_ENV']): boolean {
  return nodeEnv === 'development' || nodeEnv === 'test'
}

const isPlainHttp = isPlainHttpEnv(env.NODE_ENV)

/**
 * The `__Host-` prefix is a browser-enforced guarantee: it refuses any cookie
 * that is not `Secure`, not `Path=/`, or that carries a `Domain`. That blocks
 * cookie fixation from a compromised sibling subdomain, which is precisely the
 * attack a long-lived visitor identifier invites.
 *
 * It cannot be used without TLS, so over plain HTTP the bare name is used. The
 * name itself therefore differs between environments — deliberately, and the
 * reason a test asserting on a cookie name must derive it from here rather than
 * hardcode the prefixed form.
 */
export function hostPrefixed(name: string, plainHttp: boolean = isPlainHttp): string {
  return plainHttp ? name : `__Host-${name}`
}

export const VISITOR_COOKIE = hostPrefixed('ed_vid')
export const SESSION_COOKIE = hostPrefixed('ed_sid')

/**
 * Consent is deliberately NOT `__Host-`-prefixed and NOT `HttpOnly`: the banner
 * has to render its own state without a round-trip, and Next.js Server
 * Components read it through `cookies()`. It is the one cookie here that carries
 * no identifier, so JS visibility costs nothing.
 */
export const CONSENT_COOKIE = 'ed_consent'

/**
 * 13 months, expressed in days.
 *
 * The CNIL ceiling that the ANPD's reading follows, and deliberately not a
 * rounded year: the point of the number is that it is the documented maximum,
 * so writing `DAYS_PER_YEAR` here would quietly shorten the window and lose the
 * reason it has that value.
 */
const VISITOR_RETENTION_DAYS = 395

/** The idle window after which a visit counts as a new session — see §3.4. */
const SESSION_IDLE_MINUTES = 30

export const VISITOR_MAX_AGE = SECONDS_PER_DAY * VISITOR_RETENTION_DAYS

export const SESSION_MAX_AGE = SECONDS_PER_MINUTE * SESSION_IDLE_MINUTES

/** 12 months, matching the consent record the banner writes. */
export const CONSENT_MAX_AGE = SECONDS_PER_DAY * DAYS_PER_YEAR

/**
 * Attributes for the two identifier cookies.
 *
 * `signed: true` matters beyond tamper-detection: an unsigned value would let a
 * caller present any visitor id they liked and write events onto someone else's
 * identity.
 */
export const trackingCookieOptions = {
  path: '/',
  httpOnly: true,
  secure: !isPlainHttp,
  sameSite: 'lax',
  signed: true,
} as const

/**
 * Attributes used to CLEAR the consent cookie. The API never sets it — the
 * banner does — but revocation has to be able to remove it, and `clearCookie`
 * only matches when path and attributes agree with what was set.
 */
export const consentCookieOptions = {
  path: '/',
  httpOnly: false,
  secure: !isPlainHttp,
  sameSite: 'lax',
  signed: false,
} as const
