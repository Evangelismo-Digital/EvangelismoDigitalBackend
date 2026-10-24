import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { truncateIp } from './truncate-ip'

describe('truncateIp — IPv4', () => {
  it('zeroes the final octet, keeping the /24 network', () => {
    expect(truncateIp('203.0.113.42')).toBe('203.0.113.0')
  })

  it('keeps addresses in the same /24 indistinguishable from each other', () => {
    expect(truncateIp('203.0.113.1')).toBe(truncateIp('203.0.113.254'))
  })

  it('keeps different /24s distinct, so city-level geolocation still works', () => {
    expect(truncateIp('203.0.113.5')).not.toBe(truncateIp('203.0.114.5'))
  })

  it('tolerates surrounding whitespace', () => {
    expect(truncateIp('  198.51.100.7  ')).toBe('198.51.100.0')
  })
})

describe('truncateIp — IPv6', () => {
  it('keeps the first three groups, discarding the rest as /48', () => {
    expect(truncateIp('2001:db8:85a3:8d3:1319:8a2e:370:7348')).toBe('2001:db8:85a3::')
  })

  it('collapses addresses sharing a /48', () => {
    const a = truncateIp('2001:db8:85a3:1::1')
    const b = truncateIp('2001:db8:85a3:2::2')

    expect(a).toBe(b)
  })

  /**
   * INVERTED deliberately. This previously asserted `'2001:DB8:85A3::'` — the
   * input's own casing echoed back. That looked like case-insensitivity and was
   * not: `2001:DB8:85A3::1` and `2001:db8:85a3::1` are the same /48 and produced
   * two different stored values, so a single prefix occupied two buckets and the
   * truncation stopped making addresses within it indistinguishable.
   *
   * The output is now canonical, which is what "case-insensitive" has to mean
   * for a value used to group by.
   */
  it('canonicalises hex digits to lower case', () => {
    expect(truncateIp('2001:DB8:85A3::1')).toBe('2001:db8:85a3::')
  })

  it('gives one /48 exactly one value, however it was written', () => {
    const written = ['2001:db8::1', '2001:0DB8:0000::5', '2001:db8:0:ffff::9', '2001:0db8:0000:0000:0000:0000:0000:1']

    expect(new Set(written.map(truncateIp)).size).toBe(1)
  })
})

describe('truncateIp — refusals', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['not an address', 'not-an-ip'],
    ['too few octets', '10.0.1'],
    ['too many octets', '10.0.0.1.5'],
    ['octet out of range', '10.0.0.999'],
    ['non-numeric octet', '10.0.0.x'],
    ['a single colon', ':'],
    ['bad hextet', '2001:zzzz:1::'],
  ])('returns null for %s rather than storing it untruncated', (_label, input) => {
    expect(truncateIp(input)).toBeNull()
  })

  /**
   * The inputs a bare range check would wave through.
   *
   * `Number('')` is 0 and `Number(' 1')` is 1 — both inside 0-255 — so without
   * the digit-shape assertion these malformed addresses would be "truncated"
   * and stored. Each case below corresponds to a mutant that survived until it
   * was written: the anchors and the shape test are load-bearing, not defensive
   * decoration.
   */
  it.each([
    ['an empty octet', '10.0..1'],
    ['a whitespace-padded octet', '10.0. 1.1'],
    ['digits followed by junk', '10.0.1x.1'],
    ['junk followed by digits', '10.0.x1.1'],
    ['a plus-signed octet', '10.0.+1.1'],
    // `Number` accepts both of these and returns a value inside 0-255, so only
    // the trailing `$` anchor rejects them. Without it, a forged
    // X-Forwarded-For of `10.0.1e2.5` would be stored as a real address.
    ['a trailing-whitespace octet', '10.0.1 .1'],
    ['an octet in exponent notation', '10.0.1e2.1'],
  ])('refuses %s, which a numeric range check alone would accept', (_label, input) => {
    expect(truncateIp(input)).toBeNull()
  })

  it.each([
    ['too few IPv6 groups', '2001:db8'],
    ['an over-long hextet', '12345:db8:1::'],
    ['a hextet that is only valid at its end', '2001:zzz1:1::'],
    ['a hextet that is only valid at its start', '2001:1zzz:1::'],
  ])('refuses %s', (_label, input) => {
    expect(truncateIp(input)).toBeNull()
  })
})

describe('truncateIp — invariants', () => {
  it('never returns a value that still contains the host portion of an IPv4 address', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 1, max: 255 }),
        ),
        ([a, b, c, d]) => {
          const truncated = truncateIp(`${a}.${b}.${c}.${d}`)

          expect(truncated).toBe(`${a}.${b}.${c}.0`)
          // The distinguishing octet must be gone, whatever it was.
          expect(truncated).not.toBe(`${a}.${b}.${c}.${d}`)
        },
      ),
    )
  })

  it('never throws, whatever it is given', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => truncateIp(input)).not.toThrow()
      }),
    )
  })

  it('is idempotent — truncating an already-truncated address changes nothing', () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
          fc.integer({ min: 0, max: 255 }),
        ),
        ([a, b, c, d]) => {
          const once = truncateIp(`${a}.${b}.${c}.${d}`)

          expect(truncateIp(once)).toBe(once)
        },
      ),
    )
  })
})
