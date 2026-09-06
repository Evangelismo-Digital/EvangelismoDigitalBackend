import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CreateChurchUseCase } from './create-church-use-case'
import { InMemoryChurchesRepository } from '@repositories/in-memory/in-memory-chuches-repository'
import { ChurchAlreadyExistsError } from '@use-cases/errors/church-already-exists-error'
import { CreateChurchError } from '@use-cases/errors/create-church-error'
import { NoAddressError } from '@use-cases/errors/no-address-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { isOk, isErr, err } from 'core/shared/result'

describe('Create Church Use Case', () => {
  let churchesRepository: InMemoryChurchesRepository
  let createChurchUseCase: CreateChurchUseCase

  beforeEach(() => {
    churchesRepository = new InMemoryChurchesRepository()
    createChurchUseCase = new CreateChurchUseCase(churchesRepository)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should create a church successfully', async () => {
    const churchData = {
      name: 'Igreja Batista Central',
      address: 'Rua das Flores, 123',
      lat: -23.5505,
      lon: -46.6333,
    }

    const result = await createChurchUseCase.execute(churchData)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const church = result.value
      expect(church).toMatchObject({
        name: churchData.name,
        address: churchData.address,
        lat: churchData.lat,
        lon: churchData.lon,
      })
      expect(church.id).toBeDefined()
      expect(church.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(church.createdAt).toBeInstanceOf(Date)
      expect(church.updatedAt).toBeInstanceOf(Date)
    }
    expect(churchesRepository.items).toHaveLength(1)
  })

  it('should return ChurchAlreadyExistsError when church with same name exists', async () => {
    const churchData = {
      name: 'Igreja Presbiteriana',
      address: 'Avenida Paulista, 1000',
      lat: -23.5631,
      lon: -46.6554,
    }

    await createChurchUseCase.execute(churchData)

    const result = await createChurchUseCase.execute(churchData)
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchAlreadyExistsError)
    }
    expect(churchesRepository.items).toHaveLength(1)
  })

  it('should not allow creating churches with same name but different locations', async () => {
    const church1 = {
      name: 'Igreja Assembleia de Deus',
      address: 'Rua A, 100',
      lat: -23.5505,
      lon: -46.6333,
    }

    const church2 = {
      name: 'Igreja Assembleia de Deus',
      address: 'Rua B, 200',
      lat: -22.9068,
      lon: -43.1729,
    }

    await createChurchUseCase.execute(church1)

    const result = await createChurchUseCase.execute(church2)
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchAlreadyExistsError)
    }
    expect(churchesRepository.items).toHaveLength(1)
  })

  // This test asserted that two differently-named churches could share exact
  // coordinates. That was only ever true of the in-memory double, which required
  // name AND lat AND lon to match; the Prisma duplicate check is
  // `name OR (lat AND lon)`, so production rejects the second one. The double
  // has been corrected, and this now pins the real rule. See D19.
  it('rejects a second church at identical coordinates, even under a different name', async () => {
    const church1 = {
      name: 'Igreja Batista',
      address: 'Rua Central, 100',
      lat: -23.5505,
      lon: -46.6333,
    }

    const church2 = {
      name: 'Igreja Metodista',
      address: 'Rua Central, 100',
      lat: -23.5505,
      lon: -46.6333,
    }

    const result1 = await createChurchUseCase.execute(church1)
    const result2 = await createChurchUseCase.execute(church2)

    expect(isOk(result1)).toBe(true)
    expect(isErr(result2)).toBe(true)
    expect(churchesRepository.items).toHaveLength(1)
  })

  it('allows a second church once the coordinates differ', async () => {
    // The counterweight: the duplicate rule must not reject everything.
    const first = await createChurchUseCase.execute({
      name: 'Igreja Batista',
      address: 'Rua Central, 100',
      lat: -23.5505,
      lon: -46.6333,
    })
    const second = await createChurchUseCase.execute({
      name: 'Igreja Metodista',
      address: 'Rua Central, 200',
      lat: -23.5605,
      lon: -46.6433,
    })

    expect(isOk(first)).toBe(true)
    expect(isOk(second)).toBe(true)
    expect(churchesRepository.items).toHaveLength(2)
  })

  it('should return CreateChurchError if repository returns error', async () => {
    vi.spyOn(churchesRepository, 'createChurch').mockResolvedValueOnce(err(new CreateChurchError()))

    const result = await createChurchUseCase.execute({
      name: 'Igreja Teste',
      address: 'Rua Teste, 123',
      lat: -23.5505,
      lon: -46.6333,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(CreateChurchError)
    }
  })

  it('should return ChurchAlreadyExistsError if duplicate error occurs', async () => {
    vi.spyOn(churchesRepository, 'createChurch').mockResolvedValueOnce(err(new ChurchAlreadyExistsError()))

    const result = await createChurchUseCase.execute({
      name: 'Igreja Duplicada',
      address: 'Rua Duplicada, 456',
      lat: -23.5505,
      lon: -46.6333,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(ChurchAlreadyExistsError)
    }
  })

  it('should return DatabaseQueryError for unexpected errors', async () => {
    const unexpectedError = new Error('Database connection failed')

    vi.spyOn(churchesRepository, 'createChurch').mockResolvedValueOnce(err(new DatabaseQueryError(unexpectedError)))

    const result = await createChurchUseCase.execute({
      name: 'Igreja Erro',
      address: 'Rua Erro, 999',
      lat: -23.5505,
      lon: -46.6333,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(DatabaseQueryError)
      expect(result.error.message).toContain('Falha de sistema ao processar consulta no banco de dados.')
    }
  })

  it('should not create church with empty address', async () => {
    const churchData = {
      name: 'Igreja Online',
      address: '',
      lat: -23.5505,
      lon: -46.6333,
    }

    const result = await createChurchUseCase.execute(churchData)
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoAddressError)
    }
    expect(churchesRepository.items).toHaveLength(0)
  })

  it('should not create church with whitespace-only address', async () => {
    const churchData = {
      name: 'Igreja Teste',
      address: '   ',
      lat: -23.5505,
      lon: -46.6333,
    }

    const result = await createChurchUseCase.execute(churchData)
    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(NoAddressError)
    }
    expect(churchesRepository.items).toHaveLength(0)
  })

  it('should create multiple churches with different names and coordinates', async () => {
    const result1 = await createChurchUseCase.execute({
      name: 'Igreja Norte',
      address: 'Rua Norte, 100',
      lat: -23.5,
      lon: -46.6,
    })

    const result2 = await createChurchUseCase.execute({
      name: 'Igreja Sul',
      address: 'Rua Sul, 200',
      lat: -23.6,
      lon: -46.7,
    })

    const result3 = await createChurchUseCase.execute({
      name: 'Igreja Leste',
      address: 'Rua Leste, 300',
      lat: -23.55,
      lon: -46.65,
    })

    expect(isOk(result1)).toBe(true)
    expect(isOk(result2)).toBe(true)
    expect(isOk(result3)).toBe(true)

    if (isOk(result1) && isOk(result2) && isOk(result3)) {
      const church1 = result1.value
      const church2 = result2.value
      const church3 = result3.value

      expect(church1.id).not.toBe(church2.id)
      expect(church2.id).not.toBe(church3.id)
      expect(church1.lat).toBe(-23.5)
      expect(church2.lat).toBe(-23.6)
      expect(church3.lat).toBe(-23.55)
    }
    expect(churchesRepository.items).toHaveLength(3)
  })

  it('should generate unique publicId for each church', async () => {
    const result1 = await createChurchUseCase.execute({
      name: 'Igreja 1',
      address: 'Rua 1',
      lat: -23.5,
      lon: -46.6,
    })

    const result2 = await createChurchUseCase.execute({
      name: 'Igreja 2',
      address: 'Rua 2',
      lat: -23.6,
      lon: -46.7,
    })

    expect(isOk(result1)).toBe(true)
    expect(isOk(result2)).toBe(true)

    if (isOk(result1) && isOk(result2)) {
      const church1 = result1.value
      const church2 = result2.value
      expect(church1.publicId).not.toBe(church2.publicId)
      expect(church1.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(church2.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    }
  })
})
