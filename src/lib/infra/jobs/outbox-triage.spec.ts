import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockEnqueueOutboxDispatch = vi.fn()

vi.mock('@lib/queue/outbox-dispatch-queue', () => ({
  enqueueOutboxDispatch: (...args: unknown[]) => mockEnqueueOutboxDispatch(...args),
}))

import { InMemoryOutboxRepository } from '@repositories/in-memory/in-memory-outbox-repository'
import { IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { isErr, isOk, ok } from 'core/shared/result'
import {
  listFailedOutboxEvents,
  retryFailedOutboxEvent,
  retryAllFailedOutboxEvents,
  purgeFailedOutboxEvents,
} from './outbox-triage'

describe('outbox-triage', () => {
  let repository: InMemoryOutboxRepository

  beforeEach(() => {
    vi.clearAllMocks()
    repository = new InMemoryOutboxRepository()
  })

  describe('listFailedOutboxEvents', () => {
    it('retorna apenas os eventos com status FAILED mapeados para o formato de resumo', async () => {
      const created1 = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: { email: 'a@test.com' },
      })
      const created2 = await repository.create({
        status: IOutboxEventStatus.PENDING,
        type: 'FormSubmissionCreated',
        payload: { email: 'b@test.com' },
      })
      if (!isOk(created1) || !isOk(created2)) throw new Error('setup')

      const result = await listFailedOutboxEvents(repository, 10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toHaveLength(1)
      expect(result.value[0].publicId).toBe(created1.value.publicId)
      expect(result.value[0].type).toBe('FormSubmissionCreated')
      expect(result.value[0].status).toBe(IOutboxEventStatus.FAILED)
      expect(result.value[0]).not.toHaveProperty('payload')
    })

    it('usa limite padrão 50 quando omitido', async () => {
      const spy = vi.spyOn(repository, 'findFailed')
      await listFailedOutboxEvents(repository)
      expect(spy).toHaveBeenCalledWith(50)
    })

    it('propaga erro quando o repositório falha', async () => {
      repository.shouldFailOn.findFailed = true

      const result = await listFailedOutboxEvents(repository, 10)

      expect(isErr(result)).toBe(true)
    })
  })

  describe('retryFailedOutboxEvent', () => {
    it('reseta o evento para PENDING e enfileira no outbox-dispatch-queue', async () => {
      const created = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: { email: 'retry@test.com' },
      })
      if (!isOk(created)) throw new Error('setup')
      const { publicId } = created.value

      const result = await retryFailedOutboxEvent(repository, publicId)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(true)

      const updated = repository.items.find((e) => e.publicId === publicId)
      expect(updated?.status).toBe(IOutboxEventStatus.PENDING)
      expect(updated?.attempts).toBe(0)
      expect(mockEnqueueOutboxDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ publicId, status: IOutboxEventStatus.PENDING }),
      )
    })

    it('retorna false e não enfileira se o evento não estiver em FAILED', async () => {
      const created = await repository.create({
        status: IOutboxEventStatus.PENDING,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      if (!isOk(created)) throw new Error('setup')

      const result = await retryFailedOutboxEvent(repository, created.value.publicId)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(false)
      expect(mockEnqueueOutboxDispatch).not.toHaveBeenCalled()
    })

    it('retorna err quando retryFailed falha no repositório', async () => {
      repository.shouldFailOn.retryFailed = true

      const result = await retryFailedOutboxEvent(repository, 'any-id')

      expect(isErr(result)).toBe(true)
    })

    it('retorna err quando findByPublicId falha após o retry', async () => {
      const created = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      if (!isOk(created)) throw new Error('setup')

      repository.shouldFailOn.findByPublicId = true

      const result = await retryFailedOutboxEvent(repository, created.value.publicId)

      expect(isErr(result)).toBe(true)
      expect(mockEnqueueOutboxDispatch).not.toHaveBeenCalled()
    })

    it('retorna ok(true) mas não enfileira se findByPublicId retornar null', async () => {
      const created = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      if (!isOk(created)) throw new Error('setup')

      vi.spyOn(repository, 'findByPublicId').mockResolvedValueOnce(ok(null))

      const result = await retryFailedOutboxEvent(repository, created.value.publicId)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(true)
      expect(mockEnqueueOutboxDispatch).not.toHaveBeenCalled()
    })
  })

  describe('retryAllFailedOutboxEvents', () => {
    it('re-tenta todos os eventos FAILED e enfileira cada um no outbox-dispatch', async () => {
      const ev1 = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: { email: 'ev1@test.com' },
      })
      const ev2 = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: { email: 'ev2@test.com' },
      })
      if (!isOk(ev1) || !isOk(ev2)) throw new Error('setup')

      const result = await retryAllFailedOutboxEvents(repository, 10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(2)
      expect(mockEnqueueOutboxDispatch).toHaveBeenCalledTimes(2)
      expect(repository.items.every((e) => e.status === IOutboxEventStatus.PENDING)).toBe(true)
    })

    it('usa limite padrão 50 quando omitido', async () => {
      const spy = vi.spyOn(repository, 'findFailed')
      await retryAllFailedOutboxEvents(repository)
      expect(spy).toHaveBeenCalledWith(50)
    })

    it('não incrementa contador se retryFailed retornar false', async () => {
      const ev = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      if (!isOk(ev)) throw new Error('setup')

      vi.spyOn(repository, 'retryFailed').mockResolvedValueOnce(ok(false))

      const result = await retryAllFailedOutboxEvents(repository, 10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(0)
    })

    it('propaga erro quando findFailed falha no repositório', async () => {
      repository.shouldFailOn.findFailed = true

      const result = await retryAllFailedOutboxEvents(repository, 10)

      expect(isErr(result)).toBe(true)
    })

    it('propaga erro quando retryFailed falha durante o loop', async () => {
      const ev = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      if (!isOk(ev)) throw new Error('setup')

      repository.shouldFailOn.retryFailed = true

      const result = await retryAllFailedOutboxEvents(repository, 10)

      expect(isErr(result)).toBe(true)
    })
  })

  describe('purgeFailedOutboxEvents', () => {
    it('deleta eventos FAILED mais antigos que o corte e retorna o total removido', async () => {
      const oldFailed = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      const recentFailed = await repository.create({
        status: IOutboxEventStatus.FAILED,
        type: 'FormSubmissionCreated',
        payload: {},
      })
      if (!isOk(oldFailed) || !isOk(recentFailed)) throw new Error('setup')

      repository.items[0].occurredAt = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

      const result = await purgeFailedOutboxEvents(repository, cutoff)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(1)
      expect(repository.items).toHaveLength(1)
      expect(repository.items[0].publicId).toBe(recentFailed.value.publicId)
    })

    it('usa batchSize padrão 1000 quando omitido', async () => {
      const spy = vi.spyOn(repository, 'deleteFailedOlderThan')
      const cutoff = new Date()
      await purgeFailedOutboxEvents(repository, cutoff)
      expect(spy).toHaveBeenCalledWith(cutoff, 1000)
    })
  })
})
