import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { DeleteChurchUseCase } from './delete-church-use-case'
import { CreateChurchUseCase } from './create-church-use-case'
import { InMemoryChurchesRepository } from '@repositories/in-memory/in-memory-chuches-repository'
import { ChurchNotFoundError } from '@use-cases/errors/church-not-found-error'
import { isOk, isErr, err } from 'core/shared/result'

describe('Delete Church Use Case', () => {
  let churchesRepository: InMemoryChurchesRepository
  let deleteChurchUseCase: DeleteChurchUseCase
  let createChurchUseCase: CreateChurchUseCase

  beforeEach(() => {
    churchesRepository = new InMemoryChurchesRepository()
    deleteChurchUseCase = new DeleteChurchUseCase(churchesRepository)
    createChurchUseCase = new CreateChurchUseCase(churchesRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should delete a church successfully by publicId', async () => {
    // Create a church first
    const createResult = await createChurchUseCase.execute({
      name: 'Igreja a ser deletada',
      address: 'Rua Teste, 123',
      lat: -23.5505,
      lon: -46.6333,
    })

    expect(isOk(createResult)).toBe(true)
    if (isOk(createResult)) {
      const church = createResult.value
      expect(churchesRepository.items).toHaveLength(1)

      // Delete the church
      const deleteResult = await deleteChurchUseCase.execute({
        publicId: church.publicId,
      })

      expect(isOk(deleteResult)).toBe(true)
      if (isOk(deleteResult)) {
        const { church: deletedChurch } = deleteResult.value
        expect(deletedChurch).toMatchObject({
          id: church.id,
          publicId: church.publicId,
          name: church.name,
          address: church.address,
          lat: church.lat,
          lon: church.lon,
        })
      }
      expect(churchesRepository.items).toHaveLength(0)
    }
  })

  it('should return ChurchNotFoundError when publicId does not exist', async () => {
    const nonExistentPublicId = '550e8400-e29b-41d4-a716-446655440000'

    const result = await deleteChurchUseCase.execute({ publicId: nonExistentPublicId })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should only delete the church with matching publicId', async () => {
    // Create multiple churches
    const church1Result = await createChurchUseCase.execute({
      name: 'Igreja 1',
      address: 'Rua 1',
      lat: -23.5,
      lon: -46.6,
    })

    const church2Result = await createChurchUseCase.execute({
      name: 'Igreja 2',
      address: 'Rua 2',
      lat: -23.6,
      lon: -46.7,
    })

    const church3Result = await createChurchUseCase.execute({
      name: 'Igreja 3',
      address: 'Rua 3',
      lat: -23.7,
      lon: -46.8,
    })

    expect(isOk(church1Result)).toBe(true)
    expect(isOk(church2Result)).toBe(true)
    expect(isOk(church3Result)).toBe(true)

    if (isOk(church1Result) && isOk(church2Result) && isOk(church3Result)) {
      const church1 = church1Result.value
      const church2 = church2Result.value
      const church3 = church3Result.value

      expect(churchesRepository.items).toHaveLength(3)

      // Delete only church2
      const deleteResult = await deleteChurchUseCase.execute({ publicId: church2.publicId })
      expect(isOk(deleteResult)).toBe(true)

      expect(churchesRepository.items).toHaveLength(2)
      expect(churchesRepository.items.find((c) => c.publicId === church1.publicId)).toBeDefined()
      expect(churchesRepository.items.find((c) => c.publicId === church2.publicId)).toBeUndefined()
      expect(churchesRepository.items.find((c) => c.publicId === church3.publicId)).toBeDefined()
    }
  })

  it('should return ChurchNotFoundError when trying to delete already deleted church', async () => {
    const createResult = await createChurchUseCase.execute({
      name: 'Igreja para deletar duas vezes',
      address: 'Rua Teste',
      lat: -23.5505,
      lon: -46.6333,
    })

    expect(isOk(createResult)).toBe(true)
    if (isOk(createResult)) {
      const church = createResult.value

      // First deletion should succeed
      const delete1 = await deleteChurchUseCase.execute({ publicId: church.publicId })
      expect(isOk(delete1)).toBe(true)

      // Second deletion should fail
      const delete2 = await deleteChurchUseCase.execute({ publicId: church.publicId })
      expect(isErr(delete2)).toBe(true)
      if (isErr(delete2)) {
        expect(delete2.error).toBeInstanceOf(ChurchNotFoundError)
      }
    }
  })

  it('should return the deleted church data', async () => {
    const churchData = {
      name: 'Igreja a Retornar',
      address: 'Rua da Igreja, 456',
      lat: -22.9068,
      lon: -43.1729,
    }

    const createResult = await createChurchUseCase.execute(churchData)
    expect(isOk(createResult)).toBe(true)
    if (isOk(createResult)) {
      const created = createResult.value

      const deleteResult = await deleteChurchUseCase.execute({
        publicId: created.publicId,
      })

      expect(isOk(deleteResult)).toBe(true)
      if (isOk(deleteResult)) {
        const { church: deleted } = deleteResult.value
        expect(deleted.name).toBe(churchData.name)
        expect(deleted.address).toBe(churchData.address)
        expect(deleted.lat).toBe(churchData.lat)
        expect(deleted.lon).toBe(churchData.lon)
        expect(deleted.publicId).toBe(created.publicId)
      }
    }
  })

  it('should return ChurchNotFoundError with invalid publicId format', async () => {
    const result = await deleteChurchUseCase.execute({ publicId: 'invalid-id' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should return ChurchNotFoundError with empty publicId', async () => {
    const result = await deleteChurchUseCase.execute({ publicId: '' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should handle repository returning null gracefully', async () => {
    vi.spyOn(churchesRepository, 'deleteChurchByPublicId').mockResolvedValueOnce(err(new ChurchNotFoundError()))

    const result = await deleteChurchUseCase.execute({ publicId: '550e8400-e29b-41d4-a716-446655440000' })
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchNotFoundError)
    }
  })

  it('should allow creating a new church with the same name after deletion', async () => {
    const churchData = {
      name: 'Igreja Recriável',
      address: 'Rua Original, 100',
      lat: -23.5505,
      lon: -46.6333,
    }

    // Create first church
    const church1Result = await createChurchUseCase.execute(churchData)
    expect(isOk(church1Result)).toBe(true)
    if (isOk(church1Result)) {
      const church1 = church1Result.value
      expect(churchesRepository.items).toHaveLength(1)

      // Delete it
      const deleteResult = await deleteChurchUseCase.execute({ publicId: church1.publicId })
      expect(isOk(deleteResult)).toBe(true)
      expect(churchesRepository.items).toHaveLength(0)

      // Create another church with the same name but different location
      const church2Result = await createChurchUseCase.execute({
        name: churchData.name,
        address: 'Rua Nova, 200',
        lat: -22.9068,
        lon: -43.1729,
      })

      expect(isOk(church2Result)).toBe(true)
      if (isOk(church2Result)) {
        const church2 = church2Result.value
        expect(churchesRepository.items).toHaveLength(1)
        expect(church2.name).toBe(churchData.name)
        expect(church2.publicId).not.toBe(church1.publicId)
      }
    }
  })
})
