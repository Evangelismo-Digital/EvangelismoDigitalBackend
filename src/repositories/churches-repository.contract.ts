import { describe, it, expect, beforeEach } from 'vitest'
import { ChurchesRepository } from 'core/contracts/repository/churches-repository.interface'
import { isOk, isErr } from 'core/shared/result'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'

/**
 * The behaviour every `ChurchesRepository` must exhibit, run against **both**
 * the Prisma implementation and the in-memory double.
 *
 * This exists because of D19 and D20: twice, the double and production quietly
 * disagreed, and twice a passing unit test was asserting the double's fiction
 * rather than the system's behaviour — a 50km radius that only the double
 * applied, and a duplicate check that was `AND` in the double and `OR` in the
 * SQL. Reading the SQL and matching it by hand is what produced those bugs in
 * the first place, so alignment is now executed rather than asserted in prose.
 *
 * Scenarios here must be expressible against a real database *and* an array, so
 * they cover the observable contract only — never SQL specifics.
 */
export interface ChurchesRepositoryUnderTest {
  /** A clean repository. Implementations truncate or re-instantiate as needed. */
  create: () => Promise<ChurchesRepository> | ChurchesRepository
}

const BASE = { name: 'Igreja Central', address: 'Av Paulista, 1000', lat: -23.5505, lon: -46.6333 }

export function describeChurchesRepositoryContract(label: string, setup: ChurchesRepositoryUnderTest): void {
  describe(`ChurchesRepository contract — ${label}`, () => {
    let repository: ChurchesRepository

    beforeEach(async () => {
      repository = await setup.create()
    })

    async function seed(overrides: Partial<typeof BASE> = {}) {
      const result = await repository.createChurch({ ...BASE, ...overrides })
      expect(isOk(result)).toBe(true)
    }

    describe('findByParams — the duplicate check', () => {
      it('matches on the same name alone, whatever the coordinates', async () => {
        await seed()

        const found = await repository.findByParams({ name: BASE.name, lat: 10, lon: 10 })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('matches on the same coordinates alone, whatever the name', async () => {
        // The half that used to differ: the double required the name to match
        // too, so it accepted duplicates the database rejects.
        await seed()

        const found = await repository.findByParams({
          name: 'Um Nome Totalmente Diferente',
          lat: BASE.lat,
          lon: BASE.lon,
        })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('matches a name differing only by case', async () => {
        await seed()

        const found = await repository.findByParams({ name: 'igreja central', lat: 10, lon: 10 })

        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('matches a name differing only by surrounding whitespace', async () => {
        await seed()

        const found = await repository.findByParams({ name: '  Igreja Central  ', lat: 10, lon: 10 })

        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('treats coordinates as equal to six decimal places', async () => {
        await seed({ lat: -23.5505004, lon: -46.6333004 })

        const found = await repository.findByParams({ name: 'Outro', lat: -23.5505001, lon: -46.6333001 })

        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('does not match when only one coordinate lines up', async () => {
        await seed()

        const found = await repository.findByParams({ name: 'Outro', lat: BASE.lat, lon: -40.0 })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toBeNull()
      })

      it('returns null — not an error — when nothing matches', async () => {
        await seed()

        const found = await repository.findByParams({ name: 'Inexistente', lat: 1, lon: 1 })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toBeNull()
      })
    })

    describe('findByName', () => {
      it('finds a church regardless of casing', async () => {
        await seed()

        const found = await repository.findByName('IGREJA CENTRAL')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value?.name).toBe(BASE.name)
      })

      it('finds a church with surrounding whitespace trimmed', async () => {
        await seed()

        const found = await repository.findByName('  Igreja Central ')

        if (isOk(found)) expect(found.value).not.toBeNull()
      })

      it('does not match on a partial name', async () => {
        await seed()

        const found = await repository.findByName('Igreja')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toBeNull()
      })

      it('returns null for an unknown name', async () => {
        const found = await repository.findByName('Inexistente')

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toBeNull()
      })
    })

    describe('findNearest', () => {
      it('orders results nearest first', async () => {
        await seed({ name: 'Distante', lat: -23.65, lon: -46.73 })
        await seed({ name: 'Perto', lat: -23.5506, lon: -46.6334 })

        const found = await repository.findNearest({ userLat: BASE.lat, userLon: BASE.lon })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) {
          expect(found.value.map((church) => church.name)).toEqual(['Perto', 'Distante'])
        }
      })

      it('applies no distance cut-off of its own (D19)', async () => {
        // The cap lives after routing, on real travelled distance. This layer
        // must keep returning the geometrically nearest candidates.
        await seed({ name: 'Perto', lat: -23.5506, lon: -46.6334 })
        await seed({ name: 'Muito Distante', lat: -24.5, lon: -47.5 })

        const found = await repository.findNearest({ userLat: BASE.lat, userLon: BASE.lon })

        if (isOk(found)) {
          expect(found.value).toHaveLength(2)
          expect(found.value[1].distanceMeters).toBeGreaterThan(50_000)
        }
      })

      it('honours the requested limit', async () => {
        await seed({ name: 'A', lat: -23.551, lon: -46.633 })
        await seed({ name: 'B', lat: -23.552, lon: -46.633 })
        await seed({ name: 'C', lat: -23.553, lon: -46.633 })

        const found = await repository.findNearest({ userLat: BASE.lat, userLon: BASE.lon, limit: 2 })

        if (isOk(found)) expect(found.value).toHaveLength(2)
      })

      it('reports metres and kilometres consistently', async () => {
        await seed({ name: 'Perto', lat: -23.5605, lon: -46.6333 })

        const found = await repository.findNearest({ userLat: BASE.lat, userLon: BASE.lon })

        if (isOk(found)) {
          const [church] = found.value
          expect(church.distanceMeters).toBeGreaterThan(0)
          expect(church.distanceKm).toBeCloseTo(church.distanceMeters / 1000, 6)
        }
      })

      it('returns an empty list when there are no churches', async () => {
        const found = await repository.findNearest({ userLat: BASE.lat, userLon: BASE.lon })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toEqual([])
      })

      it('accepts a query ceiling without changing the answer', async () => {
        await seed({ name: 'Perto', lat: -23.5506, lon: -46.6334 })

        const found = await repository.findNearest({
          userLat: BASE.lat,
          userLon: BASE.lon,
          timeoutMs: 5_000,
        })

        expect(isOk(found)).toBe(true)
        if (isOk(found)) expect(found.value).toHaveLength(1)
      })
    })

    describe('createChurch', () => {
      it('assigns a public id the caller can use afterwards', async () => {
        const created = await repository.createChurch(BASE)

        expect(isOk(created)).toBe(true)
        if (isOk(created)) {
          expect(created.value.publicId).toBeTruthy()

          const found = await repository.findByName(BASE.name)
          if (isOk(found)) expect(found.value?.publicId).toBe(created.value.publicId)
        }
      })
    })

    describe('deleteChurchByPublicId', () => {
      it('removes the church and returns the row that went', async () => {
        const created = await repository.createChurch(BASE)
        const publicId = isOk(created) ? created.value.publicId : ''

        const deleted = await repository.deleteChurchByPublicId(publicId)

        expect(isOk(deleted)).toBe(true)
        if (isOk(deleted)) expect(deleted.value.publicId).toBe(publicId)

        const found = await repository.findByName(BASE.name)
        if (isOk(found)) expect(found.value).toBeNull()
      })

      it('reports not-found for an unknown public id', async () => {
        const deleted = await repository.deleteChurchByPublicId('does-not-exist')

        expect(isErr(deleted)).toBe(true)
        if (isErr(deleted)) expect(deleted.error).toBeInstanceOf(ChurchNotFoundError)
      })
    })
  })
}
