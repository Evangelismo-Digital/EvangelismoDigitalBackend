import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FindNearestChurchesUseCase } from './find-nearest-churches-use-case'
import { CepToLatLonUseCase } from './cep-to-lat-lon-use-case'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn-use-case'
import { CalculateChurchRouteDistancesUseCase } from './calculate-church-route-distances-use-case'
import { ChurchPresenter } from '@http/presenters/church-presenter'
import { isOk, ok, isErr, errOf } from 'core/shared/result'
import { ServiceOverloadError as CacheServiceOverloadError } from '@lib/errors/infra/cache/service-overload-error'
import { TimeoutExceededOnFetchError as CacheTimeoutError } from '@lib/errors/infra/cache/timeout-exceed-on-fetch-error'
import { ServiceOverloadError as InfraServiceOverloadError } from 'errors/infrastructure/service-overload-error'
import { TimeoutExceededError } from 'errors/infrastructure/timeout-exceeded-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { NoNearbyChurchesFoundError } from '@use-cases/errors/no-nearby-churches-found-error'
import { CachedFailureError } from '@lib/infra/cache/resilient-cache'

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
    CachedFailureError: class CachedFailureError extends Error {
      errorType: string
      errorData: unknown

      constructor(type: string, message: string, data?: unknown) {
        super(message)
        this.name = 'CachedFailureError'
        this.errorType = type
        this.errorData = data
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

    mockGetOrFetch.mockResolvedValueOnce(cachedResponse)

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
    expect(cepToLatLonUseCase.execute).toHaveBeenCalledWith({ cep: '01310100' })
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

  it('should return TimeoutExceededError when cache throws CacheTimeoutError (CacheOvertime)', async () => {
    mockGetOrFetch.mockRejectedValueOnce(new CacheTimeoutError('Cache get timeout'))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(TimeoutExceededError)
    }
  })

  it('should return InfraServiceOverloadError when cache throws CacheServiceOverloadError (CacheOverload)', async () => {
    mockGetOrFetch.mockRejectedValueOnce(new CacheServiceOverloadError())
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InfraServiceOverloadError)
    }
  })

  it('should unwrap CachedFailureError back to InvalidCepError', async () => {
    const originalError = new InvalidCepError()
    const cachedError = new CachedFailureError('InvalidCepError', 'Invalid CEP', originalError)
    mockGetOrFetch.mockRejectedValueOnce(cachedError)

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(InvalidCepError)
    }
  })

  it('should unwrap CachedFailureError back to CoordinatesNotFoundError', async () => {
    const originalError = new CoordinatesNotFoundError()
    const cachedError = new CachedFailureError('CoordinatesNotFoundError', 'Not found', originalError)
    mockGetOrFetch.mockRejectedValueOnce(cachedError)

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CoordinatesNotFoundError)
    }
  })

  it('should return NoNearbyChurchesFoundError when cache throws CachedFailureError of an unknown type (Cache Unknown Failure)', async () => {
    mockGetOrFetch.mockRejectedValueOnce(new CachedFailureError('UnknownErrorType', 'Unexpected cached failure', {}))
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
      return errOf(new TimeoutExceededError('Aborted'))
    })

    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(TimeoutExceededError)
    }
  })

  it('should return NoNearbyChurchesFoundError when cache throws an unhandled raw Error (Fatal Errors)', async () => {
    mockGetOrFetch.mockRejectedValueOnce(new Error('Fatal database crash'))
    const result = await useCase.execute({ cep: '00000000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoNearbyChurchesFoundError)
    }
  })
})
