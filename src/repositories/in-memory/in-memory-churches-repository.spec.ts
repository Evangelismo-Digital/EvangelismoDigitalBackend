import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryChurchesRepository } from './in-memory-chuches-repository'
import { isOk, isErr } from 'core/shared/result'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'

/**
 * The double is only useful while it behaves like the real repository.
 *
 * D19 is the cautionary tale: it enforced a 50km radius the Prisma query never
 * applied, so a unit test asserting that filtering passed against a fiction and
 * would never have caught production returning distant churches. These tests
 * pin the behaviour the double is supposed to imitate.
 */
describe('InMemoryChurchesRepository', () => {
  let repository: InMemoryChurchesRepository

  const saoPaulo = { lat: -23.5505, lon: -46.6333 }

  async function seed(name: string, lat: number, lon: number) {
    const created = await repository.createChurch({ name, address: `Rua ${name}`, lat, lon })
    expect(isOk(created)).toBe(true)
  }

  beforeEach(() => {
    repository = new InMemoryChurchesRepository()
  })

  describe('findNearest', () => {
    it('orders results nearest first', async () => {
      await seed('Distante', -23.6, -46.7)
      await seed('Perto', -23.5506, -46.6334)
      await seed('Media', -23.56, -46.64)

      const result = await repository.findNearest({ ...saoPaulo, userLat: saoPaulo.lat, userLon: saoPaulo.lon })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value.map((c) => c.name)).toEqual(['Perto', 'Media', 'Distante'])
      }
    })

    it('applies no distance cut-off, matching the Prisma query (D19)', async () => {
      await seed('Perto', -23.5506, -46.6334)
      await seed('Muito Distante', -24.0, -47.0) // > 50km away

      const result = await repository.findNearest({ userLat: saoPaulo.lat, userLon: saoPaulo.lon })

      if (isOk(result)) {
        expect(result.value).toHaveLength(2)
        expect(result.value[1].distanceMeters).toBeGreaterThan(50_000)
      }
    })

    it('honours the requested limit', async () => {
      for (let i = 0; i < 12; i++) {
        await seed(`Igreja ${i}`, -23.55 + i * 0.001, -46.63)
      }

      const result = await repository.findNearest({ userLat: saoPaulo.lat, userLon: saoPaulo.lon, limit: 3 })

      if (isOk(result)) expect(result.value).toHaveLength(3)
    })

    it('reports both metres and kilometres for the same distance', async () => {
      await seed('Perto', -23.5605, -46.6333) // ~1.1km due south

      const result = await repository.findNearest({ userLat: saoPaulo.lat, userLon: saoPaulo.lon })

      if (isOk(result)) {
        const [church] = result.value
        expect(church.distanceKm).toBeCloseTo(church.distanceMeters / 1000, 9)
        expect(church.distanceMeters).toBeGreaterThan(0)
      }
    })

    it('measures a known distance to within a percent of the great-circle value', async () => {
      // 0.1° of latitude ≈ 11.1km; a broken Haversine would be wildly off.
      await seed('Sul', saoPaulo.lat - 0.1, saoPaulo.lon)

      const result = await repository.findNearest({ userLat: saoPaulo.lat, userLon: saoPaulo.lon })

      if (isOk(result)) {
        expect(result.value[0].distanceMeters).toBeGreaterThan(11_000)
        expect(result.value[0].distanceMeters).toBeLessThan(11_200)
      }
    })

    it('returns an empty list when there are no churches at all', async () => {
      const result = await repository.findNearest({ userLat: saoPaulo.lat, userLon: saoPaulo.lon })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toEqual([])
    })

    it('accepts a query ceiling without changing its answer', async () => {
      // The double cannot enforce a statement timeout; it must not choke on one.
      await seed('Perto', -23.5506, -46.6334)

      const result = await repository.findNearest({ userLat: saoPaulo.lat, userLon: saoPaulo.lon, timeoutMs: 250 })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toHaveLength(1)
    })
  })

  describe('lookups', () => {
    it('finds a church by exact name', async () => {
      await seed('Igreja Central', -23.55, -46.63)

      const result = await repository.findByName('Igreja Central')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value?.name).toBe('Igreja Central')
    })

    it('returns null for an unknown name', async () => {
      const result = await repository.findByName('Inexistente')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBeNull()
    })

    it('detects a duplicate by name or by coordinates', async () => {
      await seed('Igreja Central', -23.55, -46.63)

      const byName = await repository.findByParams({ name: 'Igreja Central', lat: 0, lon: 0 })
      const byCoords = await repository.findByParams({ name: 'Outro Nome', lat: -23.55, lon: -46.63 })

      if (isOk(byName)) expect(byName.value).not.toBeNull()
      if (isOk(byCoords)) expect(byCoords.value).not.toBeNull()
    })

    it('returns null when neither name nor coordinates match', async () => {
      await seed('Igreja Central', -23.55, -46.63)

      const result = await repository.findByParams({ name: 'Outra', lat: 10, lon: 10 })

      if (isOk(result)) expect(result.value).toBeNull()
    })
  })

  describe('deleteChurchByPublicId', () => {
    it('removes the church and returns it', async () => {
      await seed('Igreja Central', -23.55, -46.63)
      const found = await repository.findByName('Igreja Central')
      const publicId = isOk(found) ? found.value!.publicId : ''

      const deleted = await repository.deleteChurchByPublicId(publicId)

      expect(isOk(deleted)).toBe(true)
      expect(repository.items).toHaveLength(0)
    })

    it('reports not-found for an unknown public id', async () => {
      const result = await repository.deleteChurchByPublicId('missing')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    })
  })
})
