/**
 * Minimal user-agent parsing: browser, OS and device class, nothing more.
 *
 * Why hand-rolled rather than a library: the raw user-agent string is NOT
 * persisted (§5.2 — it is a fingerprinting vector with no analytical gain over
 * these three fields), so the only question asked of it is which of a dozen
 * coarse buckets it falls into. A full parser would add a runtime dependency,
 * and a monthly-updated regex database, to answer a question this narrow.
 *
 * The trade-off is stated plainly: this recognises the mainstream engines and
 * answers `null` for everything else. `null` is a truthful "not recognised" —
 * far better than a library's confident guess at a spoofed string, and every
 * caller already treats these columns as nullable.
 */

export type DeviceClass = 'mobile' | 'tablet' | 'desktop'

export interface ParsedUserAgent {
  browser: string | null
  os: string | null
  device: DeviceClass | null
}

/**
 * Order is significant, and the reason the list is a table rather than a chain
 * of `if`s: Edge, Opera and Samsung Internet all carry `Chrome/` in their
 * user-agent, and Chrome carries `Safari/`. Each entry must therefore be tried
 * before the more generic one below it.
 */
const BROWSER_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/edg(?:e|a|ios)?\//i, 'Edge'],
  [/(?:opr|opera)\//i, 'Opera'],
  [/samsungbrowser\//i, 'Samsung Internet'],
  [/(?:firefox|fxios)\//i, 'Firefox'],
  [/(?:chrome|crios)\//i, 'Chrome'],
  [/safari\//i, 'Safari'],
]

/** Android must precede Linux: every Android user-agent also says `Linux`. */
const OS_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/windows nt/i, 'Windows'],
  [/android/i, 'Android'],
  [/(?:iphone|ipad|ipod)/i, 'iOS'],
  [/mac os x/i, 'macOS'],
  [/linux/i, 'Linux'],
]

const TABLET_HINTS = ['ipad', 'tablet', 'playbook', 'silk', 'kindle']
const MOBILE_HINTS = ['mobile', 'iphone', 'ipod', 'phone']

function firstMatch(userAgent: string, patterns: ReadonlyArray<readonly [RegExp, string]>): string | null {
  return patterns.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null
}

/**
 * Device class from the coarse hints in the string.
 *
 * Plain substring tests rather than one combined regex: the Android rule is
 * "says Android but NOT Mobile", which as a regex needs a `.*` lookahead — the
 * shape that makes a pattern vulnerable to catastrophic backtracking on hostile
 * input. `includes` cannot backtrack at all.
 */
function detectDevice(userAgent: string): DeviceClass | null {
  const lower = userAgent.toLowerCase()

  if (TABLET_HINTS.some((hint) => lower.includes(hint))) {
    return 'tablet'
  }

  // Android tablets are identified by the ABSENCE of "Mobile" — that is the
  // convention Google documents, not a heuristic.
  if (lower.includes('android')) {
    return lower.includes('mobile') ? 'mobile' : 'tablet'
  }

  if (MOBILE_HINTS.some((hint) => lower.includes(hint))) {
    return 'mobile'
  }

  return firstMatch(userAgent, OS_PATTERNS) === null ? null : 'desktop'
}

/**
 * Never throws and never returns a partially-built object: an unparseable or
 * absent user-agent yields all-null, which is exactly what the nullable columns
 * are for. Analytics must not be able to fail a request.
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  if (!userAgent) {
    return { browser: null, os: null, device: null }
  }

  return {
    browser: firstMatch(userAgent, BROWSER_PATTERNS),
    os: firstMatch(userAgent, OS_PATTERNS),
    device: detectDevice(userAgent),
  }
}
