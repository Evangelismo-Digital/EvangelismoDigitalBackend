import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn-use-case'
import { ChurchesRepository, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { ok, err, isOk, isErr } from 'core/shared/result'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { CHURCH_CONSTANTS } from 'messages/constants/churches/churches'

function nearby(id: number): NearbyChurch {
  return {
    id,
    publicId: `pub-${id}`,
    name: `Church ${id}`,
    address: null,
    lat: -23.5,
    lon: -46.6,
    distanceKm: id,
    distanceMeters: id * 1000,
  }
}

describe('FindNearbyChurchesKnnUseCase', () => {
  let repository: ChurchesRepository
  let useCase: FindNearbyChurchesKnnUseCase

  beforeEach(() => {
    repository = {
      findNearest: vi.fn(),
      findByParams: vi.fn(),
      findByName: vi.fn(),
      createChurch: vi.fn(),
      deleteChurchByPublicId: vi.fn(),
    }
    useCase = new FindNearbyChurchesKnnUseCase(repository)
  })

  it.each([-90.0001, 90.0001, 200, -200])(
    'rejects out-of-range latitude %s with LatitudeRangeError',
    async (userLat) => {
      const result = await useCase.execute({ userLat, userLon: 0 })

      expect(isErr(result)).toBe(true)
      if (isErr(result)) expect(result.error).toBeInstanceOf(LatitudeRangeError)
      expect(repository.findNearest).not.toHaveBeenCalled()
    },
  )

  it.each([-90, 0, 90])('accepts the latitude boundary %s', async (userLat) => {
    vi.mocked(repository.findNearest).mockResolvedValue(ok([]))

    const result = await useCase.execute({ userLat, userLon: 0 })

    expect(isOk(result)).toBe(true)
  })

  it.each([-180.0001, 180.0001])('rejects out-of-range longitude %s with LongitudeRangeError', async (userLon) => {
    const result = await useCase.execute({ userLat: 0, userLon })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(LongitudeRangeError)
    expect(repository.findNearest).not.toHaveBeenCalled()
  })

  it.each([-180, 0, 180])('accepts the longitude boundary %s', async (userLon) => {
    vi.mocked(repository.findNearest).mockResolvedValue(ok([]))

    const result = await useCase.execute({ userLat: 0, userLon })

    expect(isOk(result)).toBe(true)
  })

  it('queries the repository with the configured KNN limit', async () => {
    vi.mocked(repository.findNearest).mockResolvedValue(ok([nearby(1)]))

    await useCase.execute({ userLat: -23.55, userLon: -46.63 })

    expect(repository.findNearest).toHaveBeenCalledWith({
      userLat: -23.55,
      userLon: -46.63,
      limit: CHURCH_CONSTANTS.KNN_LIMIT,
    })
  })

  it('returns the churches and an accurate totalFound count', async () => {
    vi.mocked(repository.findNearest).mockResolvedValue(ok([nearby(1), nearby(2), nearby(3)]))

    const result = await useCase.execute({ userLat: 0, userLon: 0 })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.churches).toHaveLength(3)
      expect(result.value.totalFound).toBe(3)
    }
  })

  it('reports totalFound 0 for an empty result set', async () => {
    vi.mocked(repository.findNearest).mockResolvedValue(ok([]))

    const result = await useCase.execute({ userLat: 0, userLon: 0 })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.churches).toEqual([])
      expect(result.value.totalFound).toBe(0)
    }
  })

  it('propagates a repository failure Result unchanged', async () => {
    const failure = err(new DatabaseQueryError(new Error('db down')))
    vi.mocked(repository.findNearest).mockResolvedValue(failure)

    const result = await useCase.execute({ userLat: 0, userLon: 0 })

    expect(result).toBe(failure)
  })
})
