import { vi, describe, it, expect, beforeEach } from 'vitest'

// Evita instanciar o PrismaClient real ao importar DatabaseContext
vi.mock('@lib/prisma', () => ({ prisma: {} }))

import { Prisma } from '@prisma/client'
import { PrismaOutboxRepository } from './prisma-outbox-event-repository'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
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
  const updateManyMock = vi.fn()
  const findManyMock = vi.fn()

  const dbContext = {
    client: {
      outboxEvent: {
        create: createMock,
        delete: deleteMock,
        deleteMany: deleteManyMock,
        update: updateMock,
        updateMany: updateManyMock,
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

      await repository.updateStatus('public-id', IOutboxEventStatus.SENDING)

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: {
          status: IOutboxEventStatus.SENDING,
          sendingAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      })
    })

    it('PENDING limpa sendingAt e não toca em attempts', async () => {
      updateMock.mockResolvedValueOnce({})

      await repository.updateStatus('public-id', IOutboxEventStatus.PENDING)

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: {
          status: IOutboxEventStatus.PENDING,
          sendingAt: null,
        },
      })
    })

    it('FAILED limpa sendingAt e não toca em attempts', async () => {
      updateMock.mockResolvedValueOnce({})

      await repository.updateStatus('public-id', IOutboxEventStatus.FAILED)

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: {
          status: IOutboxEventStatus.FAILED,
          sendingAt: null,
        },
      })
    })

    it('erro do banco vira err via mapper', async () => {
      updateMock.mockRejectedValueOnce(makePrismaError('P2025'))

      const result = await repository.updateStatus('public-id', IOutboxEventStatus.PENDING)

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })

  describe('updatePendingRecipients', () => {
    it('atualiza a coluna pendingRecipients filtrada por publicId', async () => {
      updateMock.mockResolvedValueOnce({})

      const result = await repository.updatePendingRecipients('public-id', ['staff@test.com'])

      expect(updateMock).toHaveBeenCalledWith({
        where: { publicId: 'public-id' },
        data: { pendingRecipients: ['staff@test.com'] },
      })
      expect(isOk(result)).toBe(true)
    })

    it('erro do banco vira err via mapper', async () => {
      updateMock.mockRejectedValueOnce(makePrismaError('P2025'))

      const result = await repository.updatePendingRecipients('public-id', ['a@test.com'])

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
          status: IOutboxEventStatus.SENDING,
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
          pendingRecipients: ['staff@test.com'],
        },
      ])

      const result = await repository.findPending(10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value[0].attempts).toBe(3)
      expect(result.value[0].sendingAt).toBeUndefined()
      expect(result.value[0].expiresAt).toBeUndefined()
      expect(result.value[0].pendingRecipients).toEqual(['staff@test.com'])
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
        status: IOutboxEventStatus.PENDING,
        type: 'PasswordResetRequested',
        payload,
        expiresAt,
      })

      expect(createMock).toHaveBeenCalledWith({
        data: {
          type: 'PasswordResetRequested',
          status: IOutboxEventStatus.PENDING,
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
        status: IOutboxEventStatus.PENDING,
        type: 'FormSubmissionCreated',
        payload: {},
      })

      expect(createMock).toHaveBeenCalledWith({
        data: {
          type: 'FormSubmissionCreated',
          status: IOutboxEventStatus.PENDING,
          payload: {},
          expiresAt: null,
        },
      })
    })
  })

  describe('deleteExpired', () => {
    it('busca um lote de ids por expiresAt <= agora e deleta por id, retornando a contagem', async () => {
      const now = new Date()
      findManyMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      deleteManyMock.mockResolvedValueOnce({ count: 2 })

      const result = await repository.deleteExpired(now, 50)

      expect(findManyMock).toHaveBeenCalledWith({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: 50,
      })
      expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(2)
    })

    it('lote vazio retorna 0 sem chamar deleteMany', async () => {
      findManyMock.mockResolvedValueOnce([])

      const result = await repository.deleteExpired(new Date(), 50)

      expect(deleteManyMock).not.toHaveBeenCalled()
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(0)
    })

    it('erro do banco vira err via mapper', async () => {
      findManyMock.mockRejectedValueOnce(makePrismaError('P2002'))

      const result = await repository.deleteExpired(new Date(), 50)

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
        byStatus: { [IOutboxEventStatus.PENDING]: 1, [IOutboxEventStatus.FAILED]: 2 },
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

  describe('deleteFailedOlderThan', () => {
    it('busca um lote de ids com status FAILED e occurredAt < corte, deleta por id e retorna a contagem', async () => {
      const cutoff = new Date()
      findManyMock.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
      deleteManyMock.mockResolvedValueOnce({ count: 2 })

      const result = await repository.deleteFailedOlderThan(cutoff, 50)

      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          status: IOutboxEventStatus.FAILED,
          occurredAt: { lt: cutoff },
        },
        select: { id: true },
        orderBy: { occurredAt: 'asc' },
        take: 50,
      })
      expect(deleteManyMock).toHaveBeenCalledWith({ where: { id: { in: [1, 2] } } })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(2)
    })

    it('lote vazio retorna 0 sem chamar deleteMany', async () => {
      findManyMock.mockResolvedValueOnce([])

      const result = await repository.deleteFailedOlderThan(new Date(), 50)

      expect(deleteManyMock).not.toHaveBeenCalled()
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(0)
    })

    it('erro do banco vira err via mapper', async () => {
      findManyMock.mockRejectedValueOnce(new Error('banco inacessível'))

      const result = await repository.deleteFailedOlderThan(new Date(), 50)

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })

  describe('claim (Compare-And-Set otimista)', () => {
    it('reivindica evento PENDING com sucesso quando count é 1', async () => {
      updateManyMock.mockResolvedValueOnce({ count: 1 })

      const result = await repository.claim({
        publicId: 'ev-1',
        fromStatus: IOutboxEventStatus.PENDING,
      })

      expect(updateManyMock).toHaveBeenCalledWith({
        where: {
          publicId: 'ev-1',
          status: IOutboxEventStatus.PENDING,
        },
        data: {
          status: IOutboxEventStatus.SENDING,
          sendingAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(true)
    })

    it('retorna false quando count é 0 (disputa de concorrência / já reivindicado)', async () => {
      updateManyMock.mockResolvedValueOnce({ count: 0 })

      const result = await repository.claim({
        publicId: 'ev-1',
        fromStatus: IOutboxEventStatus.PENDING,
      })

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(false)
    })

    it('reivindica evento SENDING travado respeitando sendingAt <= stuckBefore', async () => {
      const stuckBefore = new Date(Date.now() - 15 * 60 * 1000)
      updateManyMock.mockResolvedValueOnce({ count: 1 })

      const result = await repository.claim({
        publicId: 'ev-stuck',
        fromStatus: IOutboxEventStatus.SENDING,
        stuckBefore,
      })

      expect(updateManyMock).toHaveBeenCalledWith({
        where: {
          publicId: 'ev-stuck',
          status: IOutboxEventStatus.SENDING,
          sendingAt: { lte: stuckBefore },
        },
        data: {
          status: IOutboxEventStatus.SENDING,
          sendingAt: expect.any(Date),
          attempts: { increment: 1 },
        },
      })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(true)
    })

    it('mapeia falhas de banco para err via infraErrorMapper', async () => {
      updateManyMock.mockRejectedValueOnce(new Error('conexão perdida'))

      const result = await repository.claim({
        publicId: 'ev-1',
        fromStatus: IOutboxEventStatus.PENDING,
      })

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })

  describe('findFailed', () => {
    it('busca eventos com status FAILED ordenados por occurredAt desc respeitando take', async () => {
      findManyMock.mockResolvedValueOnce([
        {
          id: 1,
          publicId: 'ev-failed-1',
          type: 'FormSubmissionCreated',
          status: IOutboxEventStatus.FAILED,
          payload: {},
          attempts: 5,
          occurredAt: new Date(),
          sendingAt: null,
          expiresAt: null,
          pendingRecipients: [],
        },
      ])

      const result = await repository.findFailed(10)

      expect(findManyMock).toHaveBeenCalledWith({
        where: { status: IOutboxEventStatus.FAILED },
        orderBy: { occurredAt: 'desc' },
        take: 10,
      })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toHaveLength(1)
      expect(result.value[0].status).toBe(IOutboxEventStatus.FAILED)
    })

    it('mapeia falhas de banco para err via infraErrorMapper', async () => {
      findManyMock.mockRejectedValueOnce(new Error('banco indisponível'))

      const result = await repository.findFailed(10)

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })

  describe('retryFailed', () => {
    it('atualiza evento de FAILED para PENDING com attempts 0 e sendingAt null', async () => {
      updateManyMock.mockResolvedValueOnce({ count: 1 })

      const result = await repository.retryFailed('ev-retry')

      expect(updateManyMock).toHaveBeenCalledWith({
        where: {
          publicId: 'ev-retry',
          status: IOutboxEventStatus.FAILED,
        },
        data: {
          status: IOutboxEventStatus.PENDING,
          sendingAt: null,
          attempts: 0,
        },
      })
      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(true)
    })

    it('retorna false quando count === 0 (evento inexistente ou não FAILED)', async () => {
      updateManyMock.mockResolvedValueOnce({ count: 0 })

      const result = await repository.retryFailed('ev-nao-failed')

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(false)
    })

    it('mapeia falhas de banco para err via infraErrorMapper', async () => {
      updateManyMock.mockRejectedValueOnce(new Error('erro no banco'))

      const result = await repository.retryFailed('ev-retry')

      expect(isErr(result)).toBe(true)
      expect(mapToKnownError).toHaveBeenCalledOnce()
    })
  })
})
