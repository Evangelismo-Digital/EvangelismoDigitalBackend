import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FindNearbyChurchesKnnUseCase } from './find-nearby-churches-knn-use-case'
import { CreateChurchUseCase } from './create-church-use-case'
import { InMemoryChurchesRepository } from '@repositories/in-memory/in-memory-chuches-repository'
import { LatitudeRangeError } from '@use-cases/errors/latitude-range-error'
import { LongitudeRangeError } from '@use-cases/errors/longitude-range-error'
import { isOk, isErr } from 'core/shared/result'

describe('Find Nearby Churches Knn Use Case Spec', () => {
  let churchesRepository: InMemoryChurchesRepository
  let findNearbyChurchesKnnUseCase: FindNearbyChurchesKnnUseCase
  let createChurchUseCase: CreateChurchUseCase

  beforeEach(() => {
    churchesRepository = new InMemoryChurchesRepository()
    findNearbyChurchesKnnUseCase = new FindNearbyChurchesKnnUseCase(churchesRepository)
    createChurchUseCase = new CreateChurchUseCase(churchesRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should find nearest churches successfully', async () => {
    // Create churches at different distances
    await createChurchUseCase.execute({
      name: 'Igreja Próxima',
      address: 'Rua A, 100',
      lat: -23.5505,
      lon: -46.6333,
    })

    await createChurchUseCase.execute({
      name: 'Igreja Média',
      address: 'Rua B, 200',
      lat: -23.56,
      lon: -46.64,
    })

    await createChurchUseCase.execute({
      name: 'Igreja Distante',
      address: 'Rua C, 300',
      lat: -23.57,
      lon: -46.65,
    })

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches, totalFound } = result.value
      expect(totalFound).toBe(3)
      expect(churches).toHaveLength(3)
      expect(churches[0].name).toBe('Igreja Próxima')
      expect(churches[0].distanceMeters).toBeDefined()
      expect(churches[0].distanceKm).toBeDefined()
    }
  })

  it('should return churches sorted by distance (closest first)', async () => {
    // Create churches at specific distances from reference point (-23.5505, -46.6333)
    await createChurchUseCase.execute({
      name: 'Igreja Distante',
      address: 'Rua Longe, 300',
      lat: -23.6,
      lon: -46.7,
    })

    await createChurchUseCase.execute({
      name: 'Igreja Próxima',
      address: 'Rua Perto, 100',
      lat: -23.5506,
      lon: -46.6334,
    })

    await createChurchUseCase.execute({
      name: 'Igreja Média',
      address: 'Rua Meio, 200',
      lat: -23.56,
      lon: -46.64,
    })

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches } = result.value
      expect(churches[0].name).toBe('Igreja Próxima')
      expect(churches[1].name).toBe('Igreja Média')
      expect(churches[2].name).toBe('Igreja Distante')

      // Verify distances are in ascending order
      expect(churches[0].distanceMeters).toBeLessThan(churches[1].distanceMeters)
      expect(churches[1].distanceMeters).toBeLessThan(churches[2].distanceMeters)
    }
  })

  it('should return empty array when no churches exist', async () => {
    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches, totalFound } = result.value
      expect(churches).toHaveLength(0)
      expect(totalFound).toBe(0)
    }
  })

  it('should return LatitudeRangeError when latitude is below -90', async () => {
    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -91,
      userLon: -46.6333,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(LatitudeRangeError)
    }
  })

  it('should return LatitudeRangeError when latitude is above 90', async () => {
    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: 91,
      userLon: -46.6333,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(LatitudeRangeError)
    }
  })

  it('should return LongitudeRangeError when longitude is below -180', async () => {
    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -181,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(LongitudeRangeError)
    }
  })

  it('should return LongitudeRangeError when longitude is above 180', async () => {
    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: 181,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(LongitudeRangeError)
    }
  })

  it('should accept valid latitude boundaries (-90 and 90)', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Polo Sul',
      address: 'Antarctica',
      lat: -89,
      lon: 0,
    })

    const resultSouth = await findNearbyChurchesKnnUseCase.execute({
      userLat: -90,
      userLon: 0,
    })

    expect(isOk(resultSouth)).toBe(true)

    const resultNorth = await findNearbyChurchesKnnUseCase.execute({
      userLat: 90,
      userLon: 0,
    })

    expect(isOk(resultNorth)).toBe(true)
  })

  it('should accept valid longitude boundaries (-180 and 180)', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Internacional',
      address: 'Linha da Data',
      lat: 0,
      lon: -179,
    })

    const resultWest = await findNearbyChurchesKnnUseCase.execute({
      userLat: 0,
      userLon: -180,
    })

    expect(isOk(resultWest)).toBe(true)

    const resultEast = await findNearbyChurchesKnnUseCase.execute({
      userLat: 0,
      userLon: 180,
    })

    expect(isOk(resultEast)).toBe(true)
  })

  it('should filter out churches beyond maxRadiusMeters (50km)', async () => {
    // Create a church very close
    await createChurchUseCase.execute({
      name: 'Igreja Próxima',
      address: 'Rua Perto',
      lat: -23.5506,
      lon: -46.6334,
    })

    // Create a church very far (more than 50km away)
    await createChurchUseCase.execute({
      name: 'Igreja Muito Distante',
      address: 'Rua Longe',
      lat: -24.0,
      lon: -47.0,
    })

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches, totalFound } = result.value
      // Should only return churches within 50km radius
      expect(totalFound).toBe(1)
      expect(churches[0].name).toBe('Igreja Próxima')
      expect(churches[0].distanceMeters).toBeLessThan(50000)
    }
  })

  it('should limit results to 20 churches', async () => {
    // Create 25 churches
    for (let i = 0; i < 25; i++) {
      await createChurchUseCase.execute({
        name: `Igreja ${i + 1}`,
        address: `Rua ${i + 1}`,
        lat: -23.55 + i * 0.001,
        lon: -46.63 + i * 0.001,
      })
    }

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches, totalFound } = result.value
      expect(totalFound).toBeLessThanOrEqual(20)
      expect(churches.length).toBeLessThanOrEqual(20)
    }
  })

  it('should calculate distance correctly with Haversine formula', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Teste',
      address: 'Rua Teste',
      lat: -23.5505,
      lon: -46.6333,
    })

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches } = result.value
      // Distance to itself should be approximately 0
      expect(churches[0].distanceMeters).toBeLessThan(1)
      expect(churches[0].distanceKm).toBeLessThan(0.001)
    }
  })

  it('should return church with all required properties', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Completa',
      address: 'Rua Completa, 123',
      lat: -23.5505,
      lon: -46.6333,
    })

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches } = result.value
      expect(churches[0]).toHaveProperty('id')
      expect(churches[0]).toHaveProperty('name')
      expect(churches[0]).toHaveProperty('address')
      expect(churches[0]).toHaveProperty('lat')
      expect(churches[0]).toHaveProperty('lon')
      expect(churches[0]).toHaveProperty('distanceMeters')
      expect(churches[0]).toHaveProperty('distanceKm')
    }
  })

  it('should convert distanceMeters to distanceKm correctly', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Distância',
      address: 'Rua Distância',
      lat: -23.56,
      lon: -46.64,
    })

    const result = await findNearbyChurchesKnnUseCase.execute({
      userLat: -23.5505,
      userLon: -46.6333,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const { churches } = result.value
      const expectedKm = churches[0].distanceMeters / 1000
      expect(churches[0].distanceKm).toBeCloseTo(expectedKm, 2)
    }
  })
})
