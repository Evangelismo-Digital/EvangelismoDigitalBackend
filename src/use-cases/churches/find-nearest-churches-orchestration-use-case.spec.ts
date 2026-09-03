import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FindNearestChurchesUseCase } from './find-nearest-churches-use-case'
import { CepToLatLonUseCase } from './cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances-use-case'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { isOk, ok, isErr, err } from 'core/shared/result'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'

const mockGetOrFetch = vi.fn()
const mockGenerateKey = vi.fn()

vi.mock('@lib/infra/cache/resilient-cache', () => {
  return {
    ResilientCache: class ResilientCacheMock {
      getOrFetch(...args: any[]) {
        return mockGetOrFetch(...args)
      }

      generateKey(...args: any[]) {
        return mockGenerateKey(...args)
      }
    },
  }
})

describe('FindNearestChurchesUseCase orchestration', () => {
  let useCase: FindNearestChurchesUseCase
  let cepToLatLonUseCase: { execute: ReturnType<typeof vi.fn> }
  let findNearbyChurchesKnnUseCase: { execute: ReturnType<typeof vi.fn> }
  let calculateChurchRouteDistancesUseCase: { findNearest: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    vi.clearAllMocks()

    mockGetOrFetch.mockReset()
    mockGenerateKey.mockReset()
    mockGenerateKey.mockImplementation((params: any) => `nearest:${params.cep}`)
    mockGetOrFetch.mockImplementation(async (_key: string, fetcher: () => Promise<unknown>) => fetcher())

    cepToLatLonUseCase = { execute: vi.fn() }
    findNearbyChurchesKnnUseCase = { execute: vi.fn() }
    calculateChurchRouteDistancesUseCase = { findNearest: vi.fn() }

    useCase = new FindNearestChurchesUseCase(
      cepToLatLonUseCase as unknown as CepToLatLonUseCase,
      findNearbyChurchesKnnUseCase as unknown as FindNearbyChurchesKnnUseCase,
      calculateChurchRouteDistancesUseCase as unknown as CalculateChurchRouteDistancesUseCase,
      {} as never,
      {
        prefix: 'nearest:',
        defaultTtlSeconds: 60,
        negativeTtlSeconds: 10,
      } as never,
    )
  })

  it('returns the cached final HTTP response and skips downstream dependencies', async () => {
    const cachedResponse = {
      nearestChurchesInfo: [
        {
          publicId: 'church-1',
          name: 'Igreja Central',
          address: 'Rua A',
          lat: -23,
          lon: -46,
          distanceKm: 1.2,
          distanceMeters: 1200,
        },
      ],
      totalFound: 1,
      precision: 'ROOFTOP',
      providerName: 'AwesomeAPI',
    }

    mockGetOrFetch.mockResolvedValueOnce(ok(cachedResponse))

    const result = await useCase.execute({ cep: '01310-100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(cachedResponse)
    }
    expect(mockGenerateKey).toHaveBeenCalledWith(expect.objectContaining({ cep: '01310100' }))
    expect(cepToLatLonUseCase.execute).not.toHaveBeenCalled()
    expect(findNearbyChurchesKnnUseCase.execute).not.toHaveBeenCalled()
    expect(calculateChurchRouteDistancesUseCase.findNearest).not.toHaveBeenCalled()
  })

  it('computes and caches the sanitized HTTP response on a cache miss', async () => {
    cepToLatLonUseCase.execute.mockResolvedValueOnce(
      ok({
        userLat: -23.55,
        userLon: -46.63,
        precision: 'ROOFTOP',
        coordinatesProviderName: 'LocationIQ',
      }),
    )

    const knnChurches = [
      {
        id: 10,
        publicId: 'church-10',
        name: 'Igreja Centro',
        address: 'Av Principal',
        lat: -23.5,
        lon: -46.6,
        distanceKm: 0,
        distanceMeters: 0,
      },
    ]

    const routedChurches = [
      {
        ...knnChurches[0],
        distanceKm: 2.4,
        distanceMeters: 2400,
      },
    ]

    findNearbyChurchesKnnUseCase.execute.mockResolvedValueOnce(
      ok({
        churches: knnChurches,
        totalFound: 1,
      }),
    )

    calculateChurchRouteDistancesUseCase.findNearest.mockResolvedValueOnce(ok(routedChurches))

    const result = await useCase.execute({ cep: '01310100' })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toEqual({
        nearestChurchesInfo: ChurchPresenter.toHTTP(routedChurches),
        totalFound: 1,
        precision: 'ROOFTOP',
        coordinatesProviderName: 'LocationIQ',
      })
    }
    expect(cepToLatLonUseCase.execute).toHaveBeenCalledWith({ cep: '01310100', signal: undefined })
    expect(findNearbyChurchesKnnUseCase.execute).toHaveBeenCalledWith({ userLat: -23.55, userLon: -46.63 })
    expect(calculateChurchRouteDistancesUseCase.findNearest).toHaveBeenCalledWith(
      {
        churches: knnChurches,
        user: { userLat: -23.55, userLon: -46.63 },
        signal: undefined,
      },
      expect.anything(),
    )
  })

  it('propagates a KNN failure and never reaches the routing step', async () => {
    cepToLatLonUseCase.execute.mockResolvedValueOnce(
      ok({ userLat: -23.55, userLon: -46.63, precision: 'ROOFTOP', coordinatesProviderName: 'LocationIQ' }),
    )
    findNearbyChurchesKnnUseCase.execute.mockResolvedValueOnce(err(new LatitudeRangeError()))

    const result = await useCase.execute({ cep: '01310100' })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(LatitudeRangeError)
    }
    expect(calculateChurchRouteDistancesUseCase.findNearest).not.toHaveBeenCalled()
  })

  it('propagates a routing failure instead of returning a partial response', async () => {
    cepToLatLonUseCase.execute.mockResolvedValueOnce(
      ok({ userLat: -23.55, userLon: -46.63, precision: 'ROOFTOP', coordinatesProviderName: 'LocationIQ' }),
    )
    findNearbyChurchesKnnUseCase.execute.mockResolvedValueOnce(ok({ churches: [{ id: 1 }], totalFound: 1 }))
    calculateChurchRouteDistancesUseCase.findNearest.mockResolvedValueOnce(err(new NoNearbyChurchesFoundError()))

    const result = await useCase.execute({ cep: '01310100' })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    }
  })

  it('propagates a CEP failure and never reaches the KNN step', async () => {
    cepToLatLonUseCase.execute.mockResolvedValueOnce(err(new InvalidCepError()))

    const result = await useCase.execute({ cep: '00000000' })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InvalidCepError)
    }
    expect(findNearbyChurchesKnnUseCase.execute).not.toHaveBeenCalled()
  })

  it('shares one timeout budget: the cache signal reaches both the CEP step and the routing step', async () => {
    const controller = new AbortController()
    mockGetOrFetch.mockImplementationOnce(async (_key: string, fetcher: (s: AbortSignal) => Promise<unknown>) =>
      fetcher(controller.signal),
    )

    cepToLatLonUseCase.execute.mockResolvedValueOnce(
      ok({ userLat: -23.55, userLon: -46.63, precision: 'ROOFTOP', coordinatesProviderName: 'LocationIQ' }),
    )
    findNearbyChurchesKnnUseCase.execute.mockResolvedValueOnce(ok({ churches: [{ id: 1 }], totalFound: 1 }))
    calculateChurchRouteDistancesUseCase.findNearest.mockResolvedValueOnce(ok([{ id: 1, distanceKm: 1 }]))

    await useCase.execute({ cep: '01310100' })

    expect(cepToLatLonUseCase.execute).toHaveBeenCalledWith({ cep: '01310100', signal: controller.signal })
    expect(calculateChurchRouteDistancesUseCase.findNearest).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
      expect.anything(),
    )
  })

  it('caches only the final response — no intermediate value is ever written', async () => {
    cepToLatLonUseCase.execute.mockResolvedValueOnce(
      ok({ userLat: -23.55, userLon: -46.63, precision: 'ROOFTOP', coordinatesProviderName: 'LocationIQ' }),
    )
    findNearbyChurchesKnnUseCase.execute.mockResolvedValueOnce(ok({ churches: [{ id: 1 }], totalFound: 1 }))
    calculateChurchRouteDistancesUseCase.findNearest.mockResolvedValueOnce(ok([{ id: 1, distanceKm: 1 }]))

    await useCase.execute({ cep: '01310100' })

    // A single cache round-trip for the whole flow, keyed by cep + profile.
    expect(mockGetOrFetch).toHaveBeenCalledTimes(1)
    expect(mockGenerateKey).toHaveBeenCalledTimes(1)
    expect(mockGenerateKey).toHaveBeenCalledWith({ cep: '01310100', profile: expect.anything() })
  })

  it('should return TimeoutExceededError when cache returns it (CacheOvertime)', async () => {
    mockGetOrFetch.mockResolvedValueOnce(err(new TimeoutExceededError('Cache get timeout')))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(TimeoutExceededError)
    }
  })

  it('should return InfraServiceOverloadError when cache returns it (CacheOverload)', async () => {
    mockGetOrFetch.mockResolvedValueOnce(err(new InfraServiceOverloadError()))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InfraServiceOverloadError)
    }
  })

  it('should unwrap err(InvalidCepError) from cache', async () => {
    mockGetOrFetch.mockResolvedValueOnce(err(new InvalidCepError()))

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InvalidCepError)
    }
  })

  it('should unwrap err(CoordinatesNotFoundError) from cache', async () => {
    mockGetOrFetch.mockResolvedValueOnce(err(new CoordinatesNotFoundError()))

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CoordinatesNotFoundError)
    }
  })

  it('should return NoNearbyChurchesFoundError when cache returns an unknown AppError', async () => {
    mockGetOrFetch.mockResolvedValueOnce(err(new NoNearbyChurchesFoundError()))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    }
  })

  it('should return TimeoutExceededError when signal is already aborted (Signal Abortion)', async () => {
    const controller = new AbortController()
    controller.abort(new Error('Aborted by client'))

    mockGetOrFetch.mockImplementationOnce(async (_key, fetcher) => {
      return fetcher(controller.signal)
    })

    cepToLatLonUseCase.execute.mockImplementationOnce(async () => {
      return err(new TimeoutExceededError('Aborted'))
    })

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(TimeoutExceededError)
    }
  })

  it('should return NoNearbyChurchesFoundError when cache returns it', async () => {
    mockGetOrFetch.mockResolvedValueOnce(err(new NoNearbyChurchesFoundError()))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    }
  })
})
