import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Regression: **`totalFound` counted KNN candidates, not the churches
 * returned.**
 *
 * A walking search returned 3 churches with `totalFound: 5`: the field was
 * copied from the KNN step, which always yields the geometric nearest
 * candidates, before routing dropped the unreachable ones and those beyond the
 * mode's ceiling. A client reading it as "how many churches did you find" was
 * told about churches it was never given. Found by the frontend's real-backend
 * suite. Defect: totalFound counts KNN candidates (2026-10-25).
 */

const mockGetOrFetch = vi.fn()

vi.mock('@infra/cache/resilient-cache', () => ({
  ResilientCache: class {
    getOrFetch(...args: unknown[]) {
      return mockGetOrFetch(...args)
    }

    generateKey() {
      return 'key'
    }
  },
}))

import { FindNearestChurchesUseCase } from './find-nearest-churches.service'
import { CepToLatLonUseCase } from './cep-to-lat-lon.service'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn.service'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances.service'
import { NearbyChurch } from '@modules/churches/repositories/churches-repository.interface'
import { NoNearbyChurchesFoundError } from '@modules/churches/errors/no-nearby-churches-found-error'
import { Deadline } from '@common/utils/deadline'
import { err, isErr, isOk, ok } from '@common/utils/result'
import { makeNearestChurchesCacheOptions } from './church-lookup-cache-policy'

function church(id: number): NearbyChurch {
  return {
    id,
    publicId: `church-${id}`,
    name: `Igreja ${id}`,
    address: `Rua ${id}`,
    lat: -22.9,
    lon: -43.1,
    distanceKm: id,
    distanceMeters: id * 1000,
  }
}

const FIVE_CANDIDATES = [1, 2, 3, 4, 5].map(church)

function useCaseRouting(routed: Awaited<ReturnType<CalculateChurchRouteDistancesUseCase['findNearest']>>) {
  return new FindNearestChurchesUseCase(
    {
      execute: vi.fn().mockResolvedValue(ok({ userLat: -22.9, userLon: -43.1, precision: 'ROOFTOP' })),
    } as unknown as CepToLatLonUseCase,
    {
      execute: vi.fn().mockResolvedValue(ok({ churches: FIVE_CANDIDATES, totalFound: FIVE_CANDIDATES.length })),
    } as unknown as FindNearbyChurchesKnnUseCase,
    { findNearest: vi.fn().mockResolvedValue(routed) } as unknown as CalculateChurchRouteDistancesUseCase,
    { redis: {} as never, options: {} as never },
  )
}

describe('Regression: totalFound counted KNN candidates, not the churches returned', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetOrFetch.mockImplementation(async (_key: string, fetcher: (d: Deadline) => Promise<unknown>) =>
      fetcher(Deadline.none()),
    )
  })

  it('reports how many churches the response actually carries', async () => {
    const result = await useCaseRouting(ok(FIVE_CANDIDATES.slice(0, 3))).execute({ cep: '24210201' })

    expect(isOk(result) && result.value.nearestChurchesInfo).toHaveLength(3)
    expect(isOk(result) && result.value.totalFound).toBe(3)
  })

  it('still reports every church when routing keeps all the candidates', async () => {
    // Counterweight: the count must follow the result, not be capped or zeroed.
    const result = await useCaseRouting(ok(FIVE_CANDIDATES)).execute({ cep: '24210201' })

    expect(isOk(result) && result.value.totalFound).toBe(5)
  })

  it('still answers NO_NEARBY_CHURCHES_FOUND, not an empty list with totalFound 0, when none qualify', async () => {
    const result = await useCaseRouting(err(new NoNearbyChurchesFoundError())).execute({ cep: '24210201' })

    expect(isErr(result) && result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
  })

  it('reads no response cached before the fix, where totalFound still meant candidates', () => {
    // Cached answers live for a week; without a new key version the old
    // meaning would keep being served after deploy.
    expect(makeNearestChurchesCacheOptions().prefix).toBe('cache:nearest-churches:v2:')
  })
})
