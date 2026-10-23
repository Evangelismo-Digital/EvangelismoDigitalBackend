import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { ok, err, isOk, isErr, Result } from './result'

describe('Result pattern helpers', () => {
  describe('ok', () => {
    it('wraps a value in a success result', () => {
      const result = ok(42)
      expect(result).toEqual({ success: true, value: 42 })
    })

    it('preserves the exact reference of the wrapped value', () => {
      const payload = { nested: { a: 1 } }
      const result = ok(payload)
      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value).toBe(payload)
      }
    })

    it('accepts undefined / null as legitimate success values', () => {
      expect(ok(undefined)).toEqual({ success: true, value: undefined })
      expect(ok(null)).toEqual({ success: true, value: null })
    })
  })

  describe('err', () => {
    it('wraps an error in a failure result', () => {
      const boom = new Error('boom')
      const result = err(boom)
      expect(result).toEqual({ success: false, error: boom })
    })

    it('preserves the exact reference of the wrapped error', () => {
      const boom = new Error('boom')
      const result = err(boom)
      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error).toBe(boom)
      }
    })
  })

  describe('isOk / isErr', () => {
    it('isOk is true and isErr is false for a success result', () => {
      const result: Result<number, Error> = ok(1)
      expect(isOk(result)).toBe(true)
      expect(isErr(result)).toBe(false)
    })

    it('isOk is false and isErr is true for a failure result', () => {
      const result: Result<number, Error> = err(new Error('x'))
      expect(isOk(result)).toBe(false)
      expect(isErr(result)).toBe(true)
    })

    it('isOk and isErr are always exact opposites (property)', () => {
      fc.assert(
        fc.property(fc.anything(), fc.boolean(), (payload, asSuccess) => {
          const result: Result<unknown, unknown> = asSuccess ? ok(payload) : err(payload)
          expect(isOk(result)).toBe(!isErr(result))
          expect(isOk(result)).toBe(asSuccess)
        }),
      )
    })

    it('round-trips any value through ok without mutation (property)', () => {
      fc.assert(
        fc.property(fc.anything(), (payload) => {
          const result = ok(payload)
          expect(isOk(result)).toBe(true)
          if (isOk(result)) {
            expect(result.value).toBe(payload)
          }
        }),
      )
    })

    it('round-trips any value through err without mutation (property)', () => {
      fc.assert(
        fc.property(fc.anything(), (payload) => {
          const result = err(payload)
          expect(isErr(result)).toBe(true)
          if (isErr(result)) {
            expect(result.error).toBe(payload)
          }
        }),
      )
    })

    it('discriminates purely on the boolean success flag, not on shape (property)', () => {
      fc.assert(
        fc.property(fc.boolean(), (flag) => {
          // A hand-rolled object with only `success` set must still narrow correctly.
          const result = { success: flag } as unknown as Result<never, never>
          expect(isOk(result)).toBe(flag)
          expect(isErr(result)).toBe(!flag)
        }),
      )
    })
  })
})
