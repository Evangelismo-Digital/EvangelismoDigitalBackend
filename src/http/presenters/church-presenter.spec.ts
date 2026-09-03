import { describe, it, expect } from 'vitest'
import { ChurchPresenter } from './church-presenter'
import { Church, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'

const church: Church = {
  id: 1,
  publicId: 'pub-1',
  name: 'Igreja Central',
  address: 'Rua A, 100',
  lat: -23.5,
  lon: -46.6,
  geog: { type: 'Point' },
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
}

const nearby: NearbyChurch = {
  id: 2,
  publicId: 'pub-2',
  name: 'Igreja Norte',
  address: 'Rua B, 200',
  lat: -23.4,
  lon: -46.5,
  distanceKm: 1.5,
  distanceMeters: 1500,
}

describe('ChurchPresenter.toHTTP', () => {
  it('serializes a single Church, exposing only the whitelisted fields', () => {
    const result = ChurchPresenter.toHTTP(church)

    expect(result).toEqual({
      publicId: 'pub-1',
      name: 'Igreja Central',
      address: 'Rua A, 100',
      lat: -23.5,
      lon: -46.6,
      geog: { type: 'Point' },
      createdAt: church.createdAt,
      updatedAt: church.updatedAt,
    })
    expect(result).not.toHaveProperty('id')
  })

  it('serializes a single NearbyChurch with distance fields and no timestamps', () => {
    const result = ChurchPresenter.toHTTP(nearby)

    expect(result).toEqual({
      publicId: 'pub-2',
      name: 'Igreja Norte',
      address: 'Rua B, 200',
      lat: -23.4,
      lon: -46.5,
      distanceKm: 1.5,
      distanceMeters: 1500,
    })
    expect(result).not.toHaveProperty('geog')
    expect(result).not.toHaveProperty('createdAt')
  })

  it('maps an array element-by-element, discriminating Church vs NearbyChurch per item', () => {
    const result = ChurchPresenter.toHTTP([church, nearby] as unknown as Church[])

    expect(result).toHaveLength(2)
    expect(result[0]).toHaveProperty('geog')
    expect(result[1]).toHaveProperty('distanceKm', 1.5)
    expect(result[1]).not.toHaveProperty('geog')
  })

  it('returns an empty array for an empty input array', () => {
    expect(ChurchPresenter.toHTTP([] as Church[])).toEqual([])
  })

  it('treats an item as NearbyChurch only when BOTH distance keys are present', () => {
    const partial = { ...church, distanceKm: 3 } as unknown as Church
    const result = ChurchPresenter.toHTTP(partial)
    // distanceMeters missing => still serialized as a full Church
    expect(result).toHaveProperty('geog')
    expect(result).not.toHaveProperty('distanceKm')
  })
})
