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
  const createMock = vi.fn()
  const deleteMock = vi.fn()
  const deleteManyMock = vi.fn()
  const updateMock = vi.fn()
  const findManyMock = vi.fn()

  const dbContext = {
    client: {
      outboxEvent: {
        create: createMock,
        delete: deleteMock,
        deleteMany: deleteManyMock,
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
          expiresAt: null,
        },
      ])

      const result = await repository.findPending(10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value[0].attempts).toBe(3)
      expect(result.value[0].sendingAt).toBeUndefined()
      expect(result.value[0].expiresAt).toBeUndefined()
    })
  })

  describe('create (expiresAt)', () => {
    it('persiste expiresAt para eventos expiráveis', async () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const payload = {
        userPublicId: 'user-1',
        name: 'João',
        email: 'joao@test.com',
        token: 'token-cru',
        tokenExpiresAt: expiresAt.toISOString(),
      }
      createMock.mockResolvedValueOnce({
        id: 1,
        publicId: 'public-id',
        type: 'PasswordResetRequested',
        status: 'PENDING',
        payload,
        attempts: 0,
        occurredAt: new Date(),
        sendingAt: null,
        expiresAt,
      })

      const result = await repository.create({
        status: IOutboxEventType.PENDING,
        type: 'PasswordResetRequested',
        payload,
        expiresAt,
      })

      expect(createMock).toHaveBeenCalledWith({
        data: {
          type: 'PasswordResetRequested',
          status: IOutboxEventType.PENDING,
          payload,
          expiresAt,
        },
      })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value.expiresAt).toEqual(expiresAt)
    })

    it('persiste expiresAt null para eventos de formulário', async () => {
      createMock.mockResolvedValueOnce({
        id: 1,
        publicId: 'public-id',
        type: 'FormSubmissionCreated',
        status: 'PENDING',
        payload: {},
        attempts: 0,
        occurredAt: new Date(),
        sendingAt: null,
        expiresAt: null,
      })

      await repository.create({
        status: IOutboxEventType.PENDING,
        type: 'FormSubmissionCreated',
        payload: {},
      })

      expect(createMock).toHaveBeenCalledWith({
        data: {
          type: 'FormSubmissionCreated',
          status: IOutboxEventType.PENDING,
          payload: {},
          expiresAt: null,
        },
      })
    })
  })

  describe('deleteExpired', () => {
    it('deleta com expiresAt <= agora e retorna a contagem', async () => {
      deleteManyMock.mockResolvedValueOnce({ count: 2 })
      const now = new Date()

      const result = await repository.deleteExpired(now)

      expect(deleteManyMock).toHaveBeenCalledWith({ where: { expiresAt: { lte: now } } })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(2)
    })

    it('erro do banco vira err via mapper', async () => {
      deleteManyMock.mockRejectedValueOnce(makePrismaError('P2002'))

      const result = await repository.deleteExpired(new Date())

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })

  describe('deleteOlderThan', () => {
    it('busca um lote de ids por occurredAt < corte e deleta por id, acumulando byStatus', async () => {
      const cutoff = new Date()
      findManyMock.mockResolvedValueOnce([
        { id: 1, status: 'PENDING' },
        { id: 2, status: 'FAILED' },
        { id: 3, status: 'FAILED' },
      ])
      deleteManyMock.mockResolvedValueOnce({ count: 3 })

      const result = await repository.deleteOlderThan(cutoff, 50)

      expect(findManyMock).toHaveBeenCalledWith({
        where: { occurredAt: { lt: cutoff } },
        select: { id: true, status: true },
        orderBy: { occurredAt: 'asc' },
        take: 50,
      })
      expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: { in: [1, 2, 3] } } })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toEqual({
        deleted: 3,
        byStatus: { [IOutboxEventType.PENDING]: 1, [IOutboxEventType.FAILED]: 2 },
      })
    })

    it('lote vazio retorna 0 sem chamar deleteMany', async () => {
      findManyMock.mockResolvedValueOnce([])

      const result = await repository.deleteOlderThan(new Date(), 50)

      expect(deleteManyMock).not.toHaveBeenCalled()
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toEqual({ deleted: 0, byStatus: {} })
    })

    it('erro do banco vira err via mapper', async () => {
      findManyMock.mockRejectedValueOnce(new Error('rede caiu'))

      const result = await repository.deleteOlderThan(new Date(), 50)

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })
})
