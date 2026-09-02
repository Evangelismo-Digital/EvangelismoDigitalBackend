import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { PrecisionHelper } from './precision-helper'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

describe('PrecisionHelper.fromOsm', () => {
  it('returns ROOFTOP when place_rank >= 26 (exact boundary)', () => {
    expect(PrecisionHelper.fromOsm({ place_rank: 26 })).toBe(EnumGeoPrecision.ROOFTOP)
    expect(PrecisionHelper.fromOsm({ place_rank: 30 })).toBe(EnumGeoPrecision.ROOFTOP)
  })

  it('does not treat place_rank 25 as ROOFTOP by rank alone', () => {
    // rank 25 with no address-ish type/class => NEIGHBORHOOD (rank >= 16 branch)
    expect(PrecisionHelper.fromOsm({ place_rank: 25 })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it('accepts numeric strings for place_rank', () => {
    expect(PrecisionHelper.fromOsm({ place_rank: '28' })).toBe(EnumGeoPrecision.ROOFTOP)
  })

  it('treats non-numeric place_rank as 0', () => {
    expect(PrecisionHelper.fromOsm({ place_rank: 'not-a-number' })).toBe(EnumGeoPrecision.CITY)
  })

  it.each(['house', 'building', 'residential', 'apartments', 'commercial'])(
    'returns ROOFTOP for low rank when type is "%s"',
    (type) => {
      expect(PrecisionHelper.fromOsm({ place_rank: 1, type })).toBe(EnumGeoPrecision.ROOFTOP)
    },
  )

  it.each(['highway', 'secondary', 'primary', 'road'])(
    'returns ROOFTOP for low rank when class is "%s"',
    (category) => {
      expect(PrecisionHelper.fromOsm({ place_rank: 1, class: category })).toBe(EnumGeoPrecision.ROOFTOP)
    },
  )

  it('returns NEIGHBORHOOD when place_rank between 16 and 25 (boundary 16)', () => {
    expect(PrecisionHelper.fromOsm({ place_rank: 16 })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
    expect(PrecisionHelper.fromOsm({ place_rank: 20 })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it.each(['neighbourhood', 'suburb', 'quarter', 'hamlet', 'district'])(
    'returns NEIGHBORHOOD for low rank when type is "%s"',
    (type) => {
      expect(PrecisionHelper.fromOsm({ place_rank: 1, type })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
    },
  )

  it('returns NEIGHBORHOOD when addresstype is "suburb"', () => {
    expect(PrecisionHelper.fromOsm({ place_rank: 1, addresstype: 'suburb' })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it('returns CITY when rank is low and nothing else matches', () => {
    expect(PrecisionHelper.fromOsm({ place_rank: 4, type: 'country', class: 'boundary' })).toBe(EnumGeoPrecision.CITY)
  })

  it('returns CITY for an empty object', () => {
    expect(PrecisionHelper.fromOsm({})).toBe(EnumGeoPrecision.CITY)
  })

  it('always returns a valid EnumGeoPrecision value (property)', () => {
    const valid = new Set(Object.values(EnumGeoPrecision))
    fc.assert(
      fc.property(
        fc.record({
          place_rank: fc.option(fc.oneof(fc.integer(), fc.string()), { nil: undefined }),
          type: fc.option(fc.string(), { nil: undefined }),
          class: fc.option(fc.string(), { nil: undefined }),
          addresstype: fc.option(fc.string(), { nil: undefined }),
        }),
        (data) => {
          expect(valid.has(PrecisionHelper.fromOsm(data))).toBe(true)
        },
      ),
    )
  })

  it('rank >= 26 dominates any type/class (property)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 26, max: 1000 }), fc.string(), fc.string(), (rank, type, cls) => {
        expect(PrecisionHelper.fromOsm({ place_rank: rank, type, class: cls })).toBe(EnumGeoPrecision.ROOFTOP)
      }),
    )
  })
})

describe('PrecisionHelper.fromAddressData', () => {
  it('returns ROOFTOP when logradouro is a non-empty string', () => {
    expect(PrecisionHelper.fromAddressData({ logradouro: 'Rua A' })).toBe(EnumGeoPrecision.ROOFTOP)
  })

  it('ignores a whitespace-only logradouro', () => {
    expect(PrecisionHelper.fromAddressData({ logradouro: '   ', bairro: 'Centro' })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it('returns NEIGHBORHOOD when only bairro is present', () => {
    expect(PrecisionHelper.fromAddressData({ bairro: 'Centro' })).toBe(EnumGeoPrecision.NEIGHBORHOOD)
  })

  it('ignores a whitespace-only bairro', () => {
    expect(PrecisionHelper.fromAddressData({ bairro: '  ' })).toBe(EnumGeoPrecision.CITY)
  })

  it('returns CITY when neither logradouro nor bairro is present', () => {
    expect(PrecisionHelper.fromAddressData({ localidade: 'São Paulo', uf: 'SP' })).toBe(EnumGeoPrecision.CITY)
  })

  it('logradouro takes precedence over bairro', () => {
    expect(PrecisionHelper.fromAddressData({ logradouro: 'Rua A', bairro: 'Centro' })).toBe(EnumGeoPrecision.ROOFTOP)
  })
})
