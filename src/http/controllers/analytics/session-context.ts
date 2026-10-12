import type { FastifyReply, FastifyRequest } from 'fastify'
import { truncateIp } from '@lib/analytics/truncate-ip'
import { parseUserAgent } from '@lib/analytics/user-agent-parser'
import { VALIDATION_LIMITS } from '@schemas/validation-limits'

/** Campaign parameters are all optional and all normalised to null. */
const UTM_PARAMS = {
  utmSource: 'utm_source',
  utmMedium: 'utm_medium',
  utmCampaign: 'utm_campaign',
  utmTerm: 'utm_term',
  utmContent: 'utm_content',
} as const

type UtmParams = Record<keyof typeof UTM_PARAMS, string | null>

function utmParams(query: Record<string, string | undefined>): UtmParams {
  return Object.fromEntries(
    Object.entries(UTM_PARAMS).map(([field, param]) => [field, query[param] || null]),
  ) as UtmParams
}

/**
 * Everything about the caller that a session row records, minimised at the
 * boundary.
 *
 * The untruncated IP and the raw user-agent are consumed here and never handed
 * further in. A later change that forgets §5.2 therefore cannot persist them —
 * they are not in scope anywhere downstream.
 */
export function sessionContext(request: FastifyRequest) {
  return {
    // `request.ip`, not a hand-parsed X-Forwarded-For. Fastify computes it with
    // @fastify/proxy-addr under the `trustProxy` setting in app.ts, so the trust
    // policy lives in one place: narrowing `trustProxy` to a known proxy subnet
    // later is a config change, and this keeps honouring it for free. The helper
    // this replaces read the left-most header entry unconditionally, which
    // bypassed that policy entirely.
    ipAddress: truncateIp(request.ip),
    ...parseUserAgent(request.headers['user-agent']),
    language: preferredLanguage(request),
    ...utmParams(request.query as Record<string, string | undefined>),
  }
}

/**
 * The first tag of Accept-Language, bounded.
 *
 * Bounded because the header is attacker-controlled and lands in a column: a
 * client may send a very long value, and BCP-47 tags are short.
 */
function preferredLanguage(request: FastifyRequest): string | null {
  const header = request.headers['accept-language']

  if (!header) {
    return null
  }

  return header.split(',')[0].trim().slice(0, VALIDATION_LIMITS.ANALYTICS_LANGUAGE_MAX) || null
}

/**
 * Headers every analytics response carries.
 *
 * `no-store` matters most: a response that sets a tracking cookie must never be
 * cached, or a shared cache would hand one visitor's identity to the next
 * person through it. The other two are cheap and close the remaining surface.
 */
export function analyticsResponseHeaders(reply: FastifyReply): void {
  reply.header('Cache-Control', 'no-store')
  reply.header('Vary', 'Origin')
  reply.header('X-Content-Type-Options', 'nosniff')
}
