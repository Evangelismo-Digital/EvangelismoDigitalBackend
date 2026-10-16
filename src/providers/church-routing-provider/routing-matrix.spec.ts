import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { acceptsMatrixStatus, allUnreachable, readDistanceRow } from './routing-matrix'

const distance = fc.oneof(fc.double({ min: 0, max: 1e4, noNaN: true }), fc.constant(null), fc.constant(undefined))

describe('routing-matrix', () => {
  describe('readDistanceRow', () => {
    it('always returns exactly one result per destination, whatever the row length', () => {
      fc.assert(
        fc.property(fc.option(fc.array(distance), { nil: undefined }), fc.nat(50), (row, count) => {
          expect(readDistanceRow(row, count)).toHaveLength(count)
        }),
      )
    })

    it('keeps every present distance — including 0 — and turns missing ones into null', () => {
      fc.assert(
        fc.property(fc.array(distance), fc.nat(50), (row, count) => {
          readDistanceRow(row, count).forEach((result, index) => {
            expect(result).toEqual({ distance: row[index] ?? null, status: 0 })
          })
        }),
      )
    })

    it('does not mistake a zero-length route for an unreachable one', () => {
      expect(readDistanceRow([0], 1)).toEqual([{ distance: 0, status: 0 }])
    })
  })

  describe('allUnreachable', () => {
    it('marks every destination as a 404 with no distance', () => {
      fc.assert(
        fc.property(fc.nat(50), (count) => {
          expect(allUnreachable(count)).toEqual(Array.from({ length: count }, () => ({ distance: null, status: 404 })))
        }),
      )
    })
  })

  describe('acceptsMatrixStatus', () => {
    it('accepts exactly the 2xx range plus 404', () => {
      fc.assert(
        fc.property(fc.integer({ min: 100, max: 599 }), (status) => {
          expect(acceptsMatrixStatus(status)).toBe((status >= 200 && status < 300) || status === 404)
        }),
      )
    })
  })
})
