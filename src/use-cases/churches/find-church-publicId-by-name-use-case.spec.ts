import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { FindChurchPublicIdByNameUseCase } from './find-church-publicId-by-name-use-case'
import { CreateChurchUseCase } from './create-church-use-case'
import { InMemoryChurchesRepository } from '@repositories/in-memory/in-memory-chuches-repository'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { isOk, isErr, ok } from 'core/shared/result'

describe('Find Church PublicId By Name Use Case', () => {
  let churchesRepository: InMemoryChurchesRepository
  let findChurchPublicIdByNameUseCase: FindChurchPublicIdByNameUseCase
  let createChurchUseCase: CreateChurchUseCase

  beforeEach(() => {
    churchesRepository = new InMemoryChurchesRepository()
    findChurchPublicIdByNameUseCase = new FindChurchPublicIdByNameUseCase(churchesRepository)
    createChurchUseCase = new CreateChurchUseCase(churchesRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should find a church publicId by name successfully', async () => {
    const churchData = {
      name: 'Igreja Batista Central',
      address: 'Rua das Flores, 123',
      lat: -23.5505,
      lon: -46.6333,
    }

    const createResult = await createChurchUseCase.execute(churchData)
    expect(isOk(createResult)).toBe(true)
    if (isOk(createResult)) {
      const createdChurch = createResult.value

      const result = await findChurchPublicIdByNameUseCase.execute({
        name: churchData.name,
      })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        const { publicId } = result.value
        expect(publicId).toBe(createdChurch.publicId)
        expect(publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      }
    }
  })

  it('should return ChurchNotFoundError when church does not exist', async () => {
    const result = await findChurchPublicIdByNameUseCase.execute({
      name: 'Igreja Inexistente',
    })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should return ChurchNotFoundError with empty name', async () => {
    const result = await findChurchPublicIdByNameUseCase.execute({
      name: '',
    })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should find the correct church when multiple churches exist', async () => {
    const church1Result = await createChurchUseCase.execute({
      name: 'Igreja Presbiteriana',
      address: 'Rua A, 100',
      lat: -23.5,
      lon: -46.6,
    })

    const church2Result = await createChurchUseCase.execute({
      name: 'Igreja Metodista',
      address: 'Rua B, 200',
      lat: -23.6,
      lon: -46.7,
    })

    const church3Result = await createChurchUseCase.execute({
      name: 'Igreja Batista',
      address: 'Rua C, 300',
      lat: -23.7,
      lon: -46.8,
    })

    expect(isOk(church1Result)).toBe(true)
    expect(isOk(church2Result)).toBe(true)
    expect(isOk(church3Result)).toBe(true)

    if (isOk(church1Result) && isOk(church2Result) && isOk(church3Result)) {
      const church2 = church2Result.value
      const church1 = church1Result.value
      const church3 = church3Result.value

      const result = await findChurchPublicIdByNameUseCase.execute({
        name: 'Igreja Metodista',
      })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        const { publicId } = result.value
        expect(publicId).toBe(church2.publicId)
        expect(publicId).not.toBe(church1.publicId)
        expect(publicId).not.toBe(church3.publicId)
      }
    }
  })

  // This asserted a case-SENSITIVE lookup, which was only true of the in-memory
  // double. The Prisma query compares `lower(trim(name))`, so production finds
  // the church regardless of casing or surrounding whitespace. The double has
  // been corrected and this now pins the real behaviour. See D19.
  it('matches a name regardless of casing, as the database does', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Batista',
      address: 'Rua Teste, 123',
      lat: -23.5505,
      lon: -46.6333,
    })

    const result = await findChurchPublicIdByNameUseCase.execute({ name: 'igreja batista' })

    expect(isOk(result)).toBe(true)
  })

  it('matches a name with surrounding whitespace trimmed', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Batista',
      address: 'Rua Teste, 123',
      lat: -23.5505,
      lon: -46.6333,
    })

    const result = await findChurchPublicIdByNameUseCase.execute({ name: '  Igreja Batista  ' })

    expect(isOk(result)).toBe(true)
  })

  it('should return ChurchNotFoundError for partial name match', async () => {
    await createChurchUseCase.execute({
      name: 'Igreja Batista Central',
      address: 'Rua Teste, 123',
      lat: -23.5505,
      lon: -46.6333,
    })

    const result = await findChurchPublicIdByNameUseCase.execute({
      name: 'Igreja Batista',
    })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should handle repository returning null gracefully', async () => {
    vi.spyOn(churchesRepository, 'findByName').mockResolvedValueOnce(ok(null))

    const result = await findChurchPublicIdByNameUseCase.execute({
      name: 'Igreja Teste',
    })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should return publicId for church with special characters in name', async () => {
    const churchData = {
      name: 'Igreja São José & Maria',
      address: 'Rua Especial, 456',
      lat: -23.5505,
      lon: -46.6333,
    }

    const createResult = await createChurchUseCase.execute(churchData)
    expect(isOk(createResult)).toBe(true)
    if (isOk(createResult)) {
      const createdChurch = createResult.value

      const result = await findChurchPublicIdByNameUseCase.execute({
        name: churchData.name,
      })

      expect(isOk(result)).toBe(true)
      if (isOk(result)) {
        const { publicId } = result.value
        expect(publicId).toBe(createdChurch.publicId)
      }
    }
  })

  it('should return the same publicId when called multiple times', async () => {
    const churchData = {
      name: 'Igreja Constante',
      address: 'Rua Fixa, 789',
      lat: -23.5505,
      lon: -46.6333,
    }

    await createChurchUseCase.execute(churchData)

    const result1 = await findChurchPublicIdByNameUseCase.execute({
      name: churchData.name,
    })
    const result2 = await findChurchPublicIdByNameUseCase.execute({
      name: churchData.name,
    })
    const result3 = await findChurchPublicIdByNameUseCase.execute({
      name: churchData.name,
    })

    expect(isOk(result1)).toBe(true)
    expect(isOk(result2)).toBe(true)
    expect(isOk(result3)).toBe(true)

    if (isOk(result1) && isOk(result2) && isOk(result3)) {
      expect(result1.value.publicId).toBe(result2.value.publicId)
      expect(result2.value.publicId).toBe(result3.value.publicId)
    }
  })
})
