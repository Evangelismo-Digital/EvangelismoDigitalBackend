import { vi, describe, it, expect, beforeEach } from 'vitest'

// Evita instanciar o PrismaClient real ao importar DatabaseContext
vi.mock('@lib/prisma', () => ({ prisma: {} }))

import { Prisma } from '@prisma/client'
import { PrismaOutboxRepository } from './prisma-outbox-event-repository'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { IOutboxEventType } from 'core/contracts/repository/outbox-repository.interface'
import { isErr, isOk } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InfrastructureError } from 'errors/infrastructure-error'

class MappedTestError extends InfrastructureError {
  constructor() {
    super({ code: 'MAPPED_TEST_ERROR', message: 'erro mapeado' })
  }
}

function makePrismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('erro do prisma', {
    code,
    clientVersion: '7.0.0',
  })
}

describe('PrismaOutboxRepository', () => {
  const deleteMock = vi.fn()
  const updateMock = vi.fn()
  const findManyMock = vi.fn()

  const dbContext = {
    client: {
      outboxEvent: {
        delete: deleteMock,
        update: updateMock,
        findMany: findManyMock,
      },
    },
  } as unknown as DatabaseContext

  const mapToKnownError = vi.fn(() => new MappedTestError())
  const mapperStub = { mapToKnownError } as unknown as PrismaErrorMapper<AppError>

  let repository: PrismaOutboxRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new PrismaOutboxRepository(dbContext, mapperStub, mapperStub)
  })

  describe('delete (idempotência P2025)', () => {
    it('trata P2025 (linha já removida) como sucesso, sem passar pelo mapper', async () => {
      deleteMock.mockRejectedValueOnce(makePrismaError('P2025'))

      const result = await repository.delete('public-id')

      expect(isOk(result)).toBe(true)
      expect(mapToKnownError).not.toHaveBeenCalled()
    })

    it('mapeia outros erros conhecidos do Prisma (ex: P2002) para err', async () => {
      deleteMock.mockRejectedValueOnce(makePrismaError('P2002'))

      const result = await repository.delete('public-id')

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })

    it('mapeia erros não-Prisma para err', async () => {
      deleteMock.mockRejectedValueOnce(new Error('rede caiu'))

      const result = await repository.delete('public-id')

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })

    it('sucesso da deleção retorna ok', async () => {
      deleteMock.mockResolvedValueOnce({})

      const result = await repository.delete('public-id')

      expect(isOk(result)).toBe(true)
    })
  })

  describe('updateStatus (semântica por status)', () => {
    it('SENDING seta sendingAt e incrementa attempts', async () => {
      updateMock.mockResolvedValueOnce({})

      await repository.updateStatus('public-id', IOutboxEventType.SENDING)

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: {
          status: IOutboxEventType.SENDING,
          sendingAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      })
    })

    it('PENDING limpa sendingAt e não toca em attempts', async () => {
      updateMock.mockResolvedValueOnce({})

      await repository.updateStatus('public-id', IOutboxEventType.PENDING)

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: {
          status: IOutboxEventType.PENDING,
          sendingAt: null,
        },
      })
    })

    it('FAILED limpa sendingAt e não toca em attempts', async () => {
      updateMock.mockResolvedValueOnce({})

      await repository.updateStatus('public-id', IOutboxEventType.FAILED)

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: {
          status: IOutboxEventType.FAILED,
          sendingAt: null,
        },
      })
    })

    it('erro do banco vira err via mapper', async () => {
      updateMock.mockRejectedValueOnce(makePrismaError('P2025'))

      const result = await repository.updateStatus('public-id', IOutboxEventType.PENDING)

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })

  describe('findStuck', () => {
    it('filtra SENDING com sendingAt <= corte e aplica o limite (take)', async () => {
      findManyMock.mockResolvedValueOnce([])
      const cutoff = new Date()

      await repository.findStuck(cutoff, 50)

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          status: IOutboxEventType.SENDING,
          sendingAt: { lte: cutoff },
        },
        orderBy: { sendingAt: 'asc' },
        take: 50,
      })
    })
  })

  describe('toEntity', () => {
    it('mapeia attempts para a entidade', async () => {
      findManyMock.mockResolvedValueOnce([
        {
          id: 1,
          publicId: 'public-id',
          type: 'FormSubmissionCreated',
          status: 'PENDING',
          payload: {},
          attempts: 3,
          occurredAt: new Date(),
          sendingAt: null,
        },
      ])

      const result = await repository.findPending(10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value[0].attempts).toBe(3)
      expect(result.value[0].sendingAt).toBeUndefined()
    })
  })
})
