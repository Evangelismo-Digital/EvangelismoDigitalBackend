import net from 'node:net'
import ipaddr from 'ipaddr.js'

/**
 * Truncates a client IP before it is stored against a 13-month identifier.
 *
 * `/24` for IPv4 and `/48` for IPv6: enough to keep city-level geolocation —
 * which is the analytical use — while discarding the host bits that identify a
 * specific connection. This is the minimisation §5.2 requires, and it is applied
 * at the boundary rather than at query time so the untruncated value is never
 * written down in the first place.
 *
 * The full address is still retained in `AuthenticationAudit`, where a security
 * purpose provides the legal basis to keep it. The two are deliberately
 * different: the same datum, different purpose, different retention.
 *
 * PARSING AND MASKING ARE `ipaddr.js`'s, NOT OURS. An earlier version did both
 * by hand with string surgery, and it was wrong three separate ways:
 *
 *   - `2001:db8::1` and `fe80::1` were REJECTED, because a `::` elision yields an
 *     empty token when it starts at or before the third group. Those visitors
 *     silently had no IP stored at all.
 *   - `10.0.0.1`, `010.0.0.1` and `10.00.0.1` produced three DIFFERENT values for
 *     one host, so a single /24 occupied three buckets — the exact opposite of
 *     what truncating is for.
 *   - `2001:db8::1.2.3.4` was mistaken for IPv4 and truncated to `1.2.3.0`,
 *     discarding a real IPv6 prefix in favour of an address that was never the
 *     client.
 *
 * `ipaddr.js` was already in the lockfile the whole time: Fastify depends on it
 * through `@fastify/proxy-addr` to compute `request.ip`. Hand-rolling it bought
 * nothing and cost three defects.
 */

/** A /24 keeps the network and drops the host. */
const IPV4_PREFIX_BITS = 24

/** A /48 is the site prefix — the IPv6 equivalent granularity. */
const IPV6_PREFIX_BITS = 48

/**
 * Returns `null` for anything that is not an unambiguous address.
 *
 * Refusing beats storing a guess: the inputs that fail here are malformed or
 * forged `X-Forwarded-For` values, and admitting one would defeat the point.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) {
    return null
  }

  const trimmed = ip.trim()

  if (hasNonStandardDottedQuad(trimmed)) {
    return null
  }

  try {
    // `process`, not `parse`: it unwraps an IPv4-mapped address (`::ffff:1.2.3.4`)
    // to the IPv4 it represents. That is what a dual-stack socket reports for an
    // ordinary IPv4 client, and masking it as IPv6 would collapse EVERY such
    // visitor into a single `::` bucket.
    const address = ipaddr.process(trimmed)

    return address.kind() === 'ipv4'
      ? ipaddr.IPv4.networkAddressFromCIDR(`${address.toString()}/${IPV4_PREFIX_BITS}`).toString()
      : ipaddr.IPv6.networkAddressFromCIDR(`${address.toString()}/${IPV6_PREFIX_BITS}`).toString()
  } catch {
    // `process` throws on anything it cannot read. Analytics must never fail a
    // request, so an unreadable address is simply not recorded.
    return null
  }
}

/**
 * Rejects a dotted portion that is not a plain four-part decimal quad.
 *
 * The one judgement neither library makes for us, because it is a policy rather
 * than a parsing question. `ipaddr.js` is deliberately liberal in the
 * `inet_aton` tradition and accepts several spellings of one host:
 *
 *   `010.0.0.1` -> 8.0.0.1   (leading zero read as OCTAL)
 *   `10.0.1`    -> 10.0.0.1  (three-part shorthand)
 *   `10.1`      -> 10.0.0.1  (two-part shorthand)
 *   `0x0a.0.0.1`-> 10.0.0.1  (hexadecimal octet)
 *
 * None of those is harmful to bucketing — they all canonicalise to the same
 * host, so they land in the same /24. They are refused because disagreement
 * BETWEEN parsers over these exact forms is the mechanism behind the
 * leading-zero SSRF bypasses (CVE-2021-29418 in `netmask` being the well-known
 * one), and a value that is stored today may be read by something else
 * tomorrow. Nothing legitimate puts them in `X-Forwarded-For`.
 *
 * The check is `net.isIPv4` rather than a regex of our own: Node already
 * encodes exactly this strictness, and hand-writing the character classes is
 * how the previous version of this file accumulated its bugs.
 */
function hasNonStandardDottedQuad(ip: string): boolean {
  const dotted = ip.slice(ip.lastIndexOf(':') + 1)

  if (!dotted.includes('.')) {
    return false
  }

  return !net.isIPv4(dotted)
}
