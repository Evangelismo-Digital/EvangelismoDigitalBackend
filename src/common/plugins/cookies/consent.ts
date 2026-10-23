import type { FastifyRequest } from 'fastify'
import { CONSENT_COOKIE } from './options'

/**
 * Reading of the `ed_consent` cookie the frontend banner writes.
 *
 * The API never SETS this cookie — it has to be JS-readable so the banner can
 * render its own state without a round-trip, and Next.js Server Components read
 * it through `cookies()`. The API only reads it, and clears it on revocation.
 *
 * Format: `v1:analytics=1,marketing=0`.
 */

/**
 * The policy version this code understands.
 *
 * Any other prefix is treated as NO consent rather than as a parse failure to
 * shrug at. That is the mechanism by which a policy change invalidates consent
 * already given (§5.1): bump this, and every previously-stored grant stops
 * counting until the visitor answers the new banner.
 */
export const CONSENT_VERSION = 'v1'

export interface ConsentState {
  analytics: boolean
  marketing: boolean
}

const NO_CONSENT: ConsentState = { analytics: false, marketing: false }

/**
 * Parses the cookie value, defaulting every category to denied.
 *
 * Absence, a malformed value, an unknown version and an explicit `0` all mean
 * the same thing here — no permission — so they collapse to one return rather
 * than being distinguished by callers who have no different action to take.
 */
export function parseConsent(raw: string | undefined): ConsentState {
  if (!raw) {
    return NO_CONSENT
  }

  // One `startsWith` rather than an indexOf plus a separate "no separator"
  // branch. The earlier spelling carried both, and a mutation run showed the
  // `=== -1` half to be an EQUIVALENT mutant — no input could distinguish it,
  // because the version comparison that followed already rejected everything it
  // was guarding against. A condition that cannot change an outcome is dead
  // code that reads like a safety check.
  const prefix = `${CONSENT_VERSION}:`

  if (!raw.startsWith(prefix)) {
    return NO_CONSENT
  }

  // Membership of exact `key=1` tokens rather than a parsed key/value map: only
  // an explicit grant counts, so every other spelling — `analytics=0`,
  // `analytics`, `analytics=true`, a repeated key — correctly reads as denied
  // without a branch per case. Consent is the one place where being liberal in
  // what you accept is the wrong instinct.
  const granted = new Set(
    raw
      .slice(prefix.length)
      .split(',')
      .map((pair) => pair.trim()),
  )

  return {
    analytics: granted.has('analytics=1'),
    marketing: granted.has('marketing=1'),
  }
}

function consentOf(request: FastifyRequest): ConsentState {
  return parseConsent(request.cookies[CONSENT_COOKIE])
}

/**
 * The single gate on identity and writes.
 *
 * Only `analytics` is consulted. `marketing` is parsed and carried for the
 * frontend's own use, but nothing in this API is conditioned on it — no code
 * path here does marketing, and a gate that reads a flag it does not act on is
 * how a flag silently acquires meaning it was never given.
 */
export function hasAnalyticsConsent(request: FastifyRequest): boolean {
  return consentOf(request).analytics
}
