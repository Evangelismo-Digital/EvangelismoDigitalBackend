/**
 * Regression — visitors on compressed IPv6 addresses had no IP stored at all.
 *
 * WHAT BROKE: `truncateIp` sliced the first three colon-separated tokens of an
 * IPv6 address verbatim. A `::` elision yields an EMPTY token, so any address
 * whose elision begins at or before the third group produced an empty group,
 * failed the hextet check, and returned null.
 *
 * That is not an exotic shape. It covers `2600:1f18::abcd` (an ordinary public
 * address), `fe80::1`, and — most consequentially — `::ffff:203.0.113.5`, which
 * is what a dual-stack socket reports for an IPv4 client. Those visitors had no
 * `ipAddress` written, so no city-level geolocation, for as long as the code
 * shipped.
 *
 * WHY IT WENT UNNOTICED: it fails SAFE. Storing nothing is privacy-preserving,
 * so no error surfaced, no test failed and no metric moved — the column was
 * simply emptier than it should have been. Every IPv6 case in the original suite
 * happened to carry three real groups before its elision.
 *
 * A SECOND defect, found in the same pass: the output was not canonical.
 * `2001:DB8:85A3::1` and `2001:db8:85a3::1` name one /48 and produced two
 * different strings, so a single prefix occupied two buckets. Truncation exists
 * to make addresses within a prefix indistinguishable from each other; a
 * non-canonical form does not do that.
 *
 * DEFECT: analytics-cookie-architecture §5.2 (minimisation).
 */
import { describe, expect, it } from 'vitest'
import { truncateIp } from './truncate-ip'

describe('compressed IPv6 addresses are truncated, not discarded', () => {
  it.each([
    // Expectations UPDATED with the move to ipaddr.js: the output is now
    // RFC 5952 canonical (`2001:db8::`) rather than the partially-expanded
    // `2001:db8:0::` the hand-rolled version emitted. Same prefix, correct
    // spelling — and one fewer way for two equal addresses to differ.
    ['elision at the third group', '2001:db8::1', '2001:db8::'],
    ['a real public address', '2600:1f18::abcd', '2600:1f18::'],
    ['link-local', 'fe80::1', 'fe80::'],
    ['loopback', '::1', '::'],
  ])('stores a /48 for %s', (_label, input, expected) => {
    expect(truncateIp(input)).toBe(expected)
  })

  it('truncates an IPv4-mapped address as the IPv4 it is', () => {
    // A dual-stack socket reports IPv4 clients this way. Truncating it as IPv6
    // would put every one of them in the single `0:0:ffff::` bucket, which is
    // worse than storing nothing: it looks like data and carries no signal.
    expect(truncateIp('::ffff:203.0.113.5')).toBe('203.0.113.0')
  })

  it('agrees with the fully-expanded spelling of the same address', () => {
    expect(truncateIp('2001:db8::1')).toBe(truncateIp('2001:0db8:0000:0000:0000:0000:0000:0001'))
  })

  it('accepts an elision standing for exactly one group', () => {
    expect(truncateIp('1:2:3:4:5:6:7::')).toBe('1:2:3::')
  })

  it('keeps the zone index out of the stored prefix', () => {
    // A scope id is a local interface label, not part of the address. The
    // hand-rolled version rejected these outright.
    expect(truncateIp('fe80::1%eth0')).toBe('fe80::')
  })
})

describe('the truncated value is canonical', () => {
  it('collapses every spelling of one /48 to a single value', () => {
    const spellings = ['2001:db8::1', '2001:0DB8:0000::5', '2001:db8:0:ffff::9', '2001:0db8:0000:0000:0000:0000:0000:1']

    expect(new Set(spellings.map(truncateIp)).size).toBe(1)
  })
})

/**
 * COUNTERWEIGHT. Accepting compressed forms must not turn into accepting
 * anything: the fix widens what parses, and the reason the original rejected
 * these addresses was an over-strict check, so the obvious overshoot is a
 * parser that now waves malformed input through untruncated.
 */
describe('the fix did not loosen validation', () => {
  it.each([
    ['two elisions', '2001:db8::1::2'],
    ['an invalid hextet', '2001:zzzz:1::'],
    ['an over-long hextet', '12345:db8:1::'],
    ['too few groups with no elision', '2001:db8'],
    ['a bare colon', ':'],
    ['nine groups', '1:2:3:4:5:6:7:8:9'],
    ['a bad embedded IPv4', '::ffff:999.0.0.1'],
    // Two elisions whose written groups happen to total eight. The hand-rolled
    // code sliced the first three tokens and never looked further, so it
    // ACCEPTED this as `1:2:3::` — it was both too strict (rejecting valid
    // compressed forms) and too loose (admitting invalid ones).
    ['two elisions totalling eight groups', '1:2:3:4::5:6:7:8::9'],
    // Shortened and hexadecimal IPv4, refused by policy rather than by parsing:
    // ipaddr.js reads all of these in the inet_aton tradition, and disagreement
    // between parsers over these exact forms is the SSRF-bypass mechanism.
    ['three-part IPv4 shorthand', '10.0.1'],
    ['two-part IPv4 shorthand', '10.1'],
    ['a hexadecimal octet', '0x0a.0.0.1'],
  ])('still refuses %s', (_label, input) => {
    expect(truncateIp(input)).toBeNull()
  })

  it('still refuses to store an unparseable value verbatim', () => {
    expect(truncateIp('not-an-ip:at-all')).toBeNull()
  })

  /**
   * `1:2:3:4:5:6:7::8` writes eight groups with a `::` standing for none.
   * RFC 4291 says the elision covers one group or more, so it is strictly
   * malformed — but there is only one way to read it, so ipaddr.js accepts it
   * and resolves it to 1:2:3:4:5:6:7:8. Accepted deliberately: the value is
   * unambiguous, and refusing notation the rest of the world tolerates would
   * lose real visitors for no gain in safety.
   */
  it('tolerates an elision standing for no groups, since it reads only one way', () => {
    expect(truncateIp('1:2:3:4:5:6:7::8')).toBe('1:2:3::')
  })
})
