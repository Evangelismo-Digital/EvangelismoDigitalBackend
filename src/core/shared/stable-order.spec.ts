/**
 * `byCodeUnit` is only ever reached through a cache key, so mutation testing
 * found it 40 % covered: the callers assert the *hash* is stable, which stays
 * true under a comparator that orders slightly differently. These tests pin the
 * comparator itself.
 *
 * The last block is the point of the module: the ordering must not depend on
 * the runtime's locale, because the output is an identifier rather than a list
 * a person reads.
 */
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { byCodeUnit } from './stable-order'

describe('byCodeUnit', () => {
  describe('the comparator contract', () => {
    it('returns a negative number when the first argument sorts first', () => {
      expect(byCodeUnit('a', 'b')).toBe(-1)
    })

    it('returns a positive number when the first argument sorts last', () => {
      expect(byCodeUnit('b', 'a')).toBe(1)
    })

    it('returns exactly zero for equal strings', () => {
      // Not "falsy": Array.prototype.sort treats 0 as "leave the order alone",
      // and a comparator returning -0 or NaN here would reorder equal keys.
      expect(byCodeUnit('a', 'a')).toBe(0)
    })

    it('orders by code unit, so uppercase precedes lowercase', () => {
      // The property that distinguishes this from localeCompare, which in most
      // locales sorts 'a' before 'B'.
      expect(byCodeUnit('B', 'a')).toBe(-1)
      expect(byCodeUnit('a', 'B')).toBe(1)
    })

    it('orders a prefix before the string that extends it', () => {
      expect(byCodeUnit('cep', 'cepAlt')).toBe(-1)
    })
  })

  describe('as a sort comparator', () => {
    it('produces the same order as the default sort, which is also by code unit', () => {
      fc.assert(
        fc.property(fc.array(fc.string()), (values) => {
          expect([...values].sort(byCodeUnit)).toEqual([...values].sort())
        }),
      )
    })

    it('is antisymmetric: swapping the arguments flips the sign', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), (a, b) => {
          // Summed rather than negated-and-compared: for two equal strings both
          // signs are 0, and `-Math.sign(0)` is `-0`, which `toBe` (Object.is)
          // considers different from `+0`. The sum states the same property
          // without walking into that.
          expect(Math.sign(byCodeUnit(a, b)) + Math.sign(byCodeUnit(b, a))).toBe(0)
        }),
      )
    })

    it('is transitive, so sorting terminates on a consistent order', () => {
      fc.assert(
        fc.property(fc.string(), fc.string(), fc.string(), (a, b, c) => {
          if (byCodeUnit(a, b) <= 0 && byCodeUnit(b, c) <= 0) {
            expect(byCodeUnit(a, c)).toBeLessThanOrEqual(0)
          }
        }),
      )
    })

    it('gives one order for a set of keys regardless of the order they arrive in', () => {
      // What the cache key actually depends on: the same parameter names, in any
      // order, must serialise identically.
      fc.assert(
        fc.property(fc.uniqueArray(fc.string(), { minLength: 1 }), (keys) => {
          const forwards = [...keys].sort(byCodeUnit)
          const backwards = [...keys].reverse().sort(byCodeUnit)

          expect(forwards).toEqual(backwards)
        }),
      )
    })
  })

  describe('locale independence — the reason this module exists', () => {
    it('disagrees with localeCompare, which is what makes it safe for a cache key', () => {
      // If these ever agreed, the module would be pointless. `localeCompare`
      // orders by the runtime's collation data, so a container that came up
      // with a different locale would hash the same parameters into a different
      // Redis key and silently split the cache.
      const accented = ['b', 'á', 'a']

      expect([...accented].sort(byCodeUnit)).toEqual(['a', 'b', 'á'])
      expect([...accented].sort((x, y) => x.localeCompare(y))).toEqual(['a', 'á', 'b'])
    })

    it('is unaffected by the locale argument that localeCompare honours', () => {
      // Turkish dotless-i is the classic collation divergence.
      const keys = ['i', 'I', 'j']

      expect([...keys].sort(byCodeUnit)).toEqual(['I', 'i', 'j'])
    })
  })
})
