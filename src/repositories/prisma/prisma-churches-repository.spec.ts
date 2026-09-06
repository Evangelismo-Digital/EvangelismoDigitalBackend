import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Unit coverage for the churches repository.
 *
 * Its behaviour was previously only exercised through the Docker e2e suite,
 * which the mutation runner cannot see — so the row mapping, the empty-result
 * branches and the error translation were all unverified at this level.
 */

const mockQueryRaw = vi.fn()
const mockQueryRawUnsafe = vi.fn()
const mockExecuteRawUnsafe = vi.fn()
const mockTransaction = vi.fn()

vi.mock('@lib/prisma', () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
    $transaction: (callback: (tx: unknown) => unknown) => mockTransaction(callback),
  },
}))

import { PrismaChurchesRepository } from './prisma-churches-repository'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { churchPrismaErrorMapping } from './errors/churches-error-mapping'
import { isOk, isErr } from 'core/shared/result'
import { CreateChurchError } from '@use-cases/errors/create-church-error'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

const storedChurch = {
  id: 1,
  publicId: 'church-1',
  name: 'Igreja Central',
  address: 'Av Paulista, 1000',
  lat: -23.5505,
  lon: -46.6333,
  geog: '0101',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

describe('PrismaChurchesRepository', () => {
  let repository: PrismaChurchesRepository

  beforeEach(() => {
    vi.clearAllMocks()
    mockQueryRaw.mockResolvedValue([])
    mockQueryRawUnsafe.mockResolvedValue([])
    mockExecuteRawUnsafe.mockResolvedValue(0)
    mockTransaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
        $executeRawUnsafe: (...args: unknown[]) => mockExecuteRawUnsafe(...args),
      }),
    )
    repository = new PrismaChurchesRepository(new PrismaErrorMapper(churchPrismaErrorMapping))
  })

  describe('findNearest', () => {
    it('derives kilometres from the metres the database returned', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ ...storedChurch, distanceMeters: 2400 }])

      const result = await repository.findNearest({ userLat: -23.55, userLon: -46.63 })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        expect(result.value[0].distanceMeters).toBe(2400)
        expect(result.value[0].distanceKm).toBe(2.4)
      }
    })

    it('keeps sub-metre precision rather than rounding it away', async () => {
      mockQueryRawUnsafe.mockResolvedValue([{ ...storedChurch, distanceMeters: 1234.5678 }])

      const result = await repository.findNearest({ userLat: -23.55, userLon: -46.63 })

      if (isOk(result)) {
        expect(result.value[0].distanceMeters).toBeCloseTo(1234.5678, 4)
        expect(result.value[0].distanceKm).toBeCloseTo(1.2345678, 7)
      }
    })

    it('asks for a candidate pool larger than the requested limit', async () => {
      // The KNN pre-filter is an approximation, so it over-fetches before the
      // exact distance pass; too small a pool can drop a genuinely nearer church.
      await repository.findNearest({ userLat: -23.55, userLon: -46.63, limit: 5 })

      const [, , , limit, candidates] = mockQueryRawUnsafe.mock.calls[0]
      expect(limit).toBe(5)
      expect(candidates).toBeGreaterThanOrEqual(100)
      expect(candidates).toBeGreaterThan(limit as number)
    })

    it('scales the candidate pool with a large limit', async () => {
      await repository.findNearest({ userLat: -23.55, userLon: -46.63, limit: 40 })

      const candidates = mockQueryRawUnsafe.mock.calls[0][4]
      expect(candidates).toBe(200)
    })

    it('passes the coordinates through in the order the query expects', async () => {
      await repository.findNearest({ userLat: -23.55, userLon: -46.63 })

      const [, lat, lon] = mockQueryRawUnsafe.mock.calls[0]
      expect(lat).toBe(-23.55)
      expect(lon).toBe(-46.63)
    })

    it('returns an empty list rather than an error when nothing is nearby', async () => {
      const result = await repository.findNearest({ userLat: -23.55, userLon: -46.63 })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toEqual([])
    })

    it('translates a database failure instead of throwing', async () => {
      mockQueryRawUnsafe.mockRejectedValue(new Error('connection reset'))

      const result = await repository.findNearest({ userLat: -23.55, userLon: -46.63 })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DatabaseQueryError)
    })
  })

  describe('createChurch', () => {
    const newChurch = { name: 'Nova Igreja', address: 'Rua A', lat: -23.5, lon: -46.6 }

    it('returns the row the database generated, including its public id', async () => {
      mockQueryRaw.mockResolvedValue([storedChurch])

      const result = await repository.createChurch(newChurch)

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.publicId).toBe('church-1')
    })

    it('reports a failure when the insert returns no row', async () => {
      mockQueryRaw.mockResolvedValue([])

      const result = await repository.createChurch(newChurch)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(CreateChurchError)
    })

    it('translates a database failure', async () => {
      mockQueryRaw.mockRejectedValue(new Error('unique violation'))

      const result = await repository.createChurch(newChurch)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(DatabaseQueryError)
    })
  })

  describe('findByParams', () => {
    it('returns the matching church', async () => {
      mockQueryRaw.mockResolvedValue([storedChurch])

      const result = await repository.findByParams({ name: 'Igreja Central', lat: -23.5505, lon: -46.6333 })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value?.name).toBe('Igreja Central')
    })

    it('returns null — not an error — when nothing matches', async () => {
      // A duplicate check that errored on "no duplicate" would block every create.
      const result = await repository.findByParams({ name: 'Nenhuma', lat: 0, lon: 0 })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBeNull()
    })

    it('translates a database failure', async () => {
      mockQueryRaw.mockRejectedValue(new Error('boom'))

      const result = await repository.findByParams({ name: 'X', lat: 0, lon: 0 })

      expect(isErr(result)).toBe(true)
    })
  })

  describe('findByName', () => {
    it('returns the matching church', async () => {
      mockQueryRaw.mockResolvedValue([storedChurch])

      const result = await repository.findByName('Igreja Central')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value?.publicId).toBe('church-1')
    })

    it('returns null when the name is unknown', async () => {
      const result = await repository.findByName('Desconhecida')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value).toBeNull()
    })

    it('translates a database failure', async () => {
      mockQueryRaw.mockRejectedValue(new Error('boom'))

      expect(isErr(await repository.findByName('X'))).toBe(true)
    })
  })

  describe('deleteChurchByPublicId', () => {
    it('returns the deleted row so the caller can report what went', async () => {
      mockQueryRaw.mockResolvedValue([storedChurch])

      const result = await repository.deleteChurchByPublicId('church-1')

      expect(isOk(result)).toBe(true)
      if (isOk(result)) expect(result.value.publicId).toBe('church-1')
    })

    it('reports not-found when the delete matched nothing', async () => {
      const result = await repository.deleteChurchByPublicId('missing')

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    })

    it('translates a database failure', async () => {
      mockQueryRaw.mockRejectedValue(new Error('boom'))

      expect(isErr(await repository.deleteChurchByPublicId('church-1'))).toBe(true)
    })
  })
})
