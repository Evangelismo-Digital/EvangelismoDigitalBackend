import { describe, it, expect, beforeEach } from 'vitest'
import { InMemoryOutboxRepository } from './in-memory-outbox-repository'
import { IOutBoxEventInputData, IOutboxEventType } from 'core/contracts/repository/outbox-repository.interface'
import { isErr, isOk } from 'core/shared/result'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'

const payload: FormPayload = { name: 'João', email: 'joao@test.com' }

function makeInput(): IOutBoxEventInputData {
  return {
    status: IOutboxEventType.PENDING,
    type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
    payload,
  }
}

function makeExpirableInput(expiresAt: Date): IOutBoxEventInputData {
  return {
    status: IOutboxEventType.PENDING,
    type: OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
    payload: {
      userPublicId: 'user-1',
      name: 'João',
      email: 'joao@test.com',
      token: 'token-cru',
      tokenExpiresAt: expiresAt.toISOString(),
    },
    expiresAt,
  }
}

describe('InMemoryOutboxRepository (contrato da máquina de estados)', () => {
  let repository: InMemoryOutboxRepository

  beforeEach(() => {
    repository = new InMemoryOutboxRepository()
  })

  describe('create', () => {
    it('cria evento PENDING com attempts 0, occurredAt definido e publicId único', async () => {
      const first = await repository.create(makeInput())
      const second = await repository.create(makeInput())

      expect(isOk(first)).toBe(true)
      expect(isOk(second)).toBe(true)
      if (!isOk(first) || !isOk(second)) return

      expect(first.value.status).toBe(IOutboxEventType.PENDING)
      expect(first.value.attempts).toBe(0)
      expect(first.value.occurredAt).toBeInstanceOf(Date)
      expect(first.value.sendingAt).toBeUndefined()
      expect(first.value.publicId).not.toBe(second.value.publicId)
    })

    it('persiste expiresAt para eventos expiráveis e deixa undefined para eventos de formulário', async () => {
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000)
      const expirable = await repository.create(makeExpirableInput(expiresAt))
      const form = await repository.create(makeInput())

      expect(isOk(expirable)).toBe(true)
      expect(isOk(form)).toBe(true)
      if (!isOk(expirable) || !isOk(form)) return

      expect(expirable.value.expiresAt).toEqual(expiresAt)
      expect(form.value.expiresAt).toBeUndefined()
    })
  })

  describe('updateStatus', () => {
    it('transição para SENDING seta sendingAt e incrementa attempts a cada ciclo', async () => {
      const created = await repository.create(makeInput())
      if (!isOk(created)) throw new Error('setup')
      const { publicId } = created.value

      await repository.updateStatus(publicId, IOutboxEventType.SENDING)
      expect(repository.items[0].attempts).toBe(1)
      expect(repository.items[0].sendingAt).toBeInstanceOf(Date)

      await repository.updateStatus(publicId, IOutboxEventType.PENDING)
      await repository.updateStatus(publicId, IOutboxEventType.SENDING)
      expect(repository.items[0].attempts).toBe(2)
    })

    it('reversão para PENDING limpa sendingAt e preserva attempts', async () => {
      const created = await repository.create(makeInput())
      if (!isOk(created)) throw new Error('setup')
      const { publicId } = created.value

      await repository.updateStatus(publicId, IOutboxEventType.SENDING)
      await repository.updateStatus(publicId, IOutboxEventType.PENDING)

      expect(repository.items[0].status).toBe(IOutboxEventType.PENDING)
      expect(repository.items[0].sendingAt).toBeUndefined()
      expect(repository.items[0].attempts).toBe(1)
    })

    it('transição para FAILED limpa sendingAt e mantém a linha (estado terminal)', async () => {
      const created = await repository.create(makeInput())
      if (!isOk(created)) throw new Error('setup')
      const { publicId } = created.value

      await repository.updateStatus(publicId, IOutboxEventType.SENDING)
      const result = await repository.updateStatus(publicId, IOutboxEventType.FAILED)

      expect(isOk(result)).toBe(true)
      expect(repository.items).toHaveLength(1)
      expect(repository.items[0].status).toBe(IOutboxEventType.FAILED)
      expect(repository.items[0].sendingAt).toBeUndefined()
    })

    it('retorna err para publicId desconhecido', async () => {
      const result = await repository.updateStatus('nao-existe', IOutboxEventType.SENDING)

      expect(isErr(result)).toBe(true)
    })
  })

  describe('delete', () => {
    it('remove a linha e é idempotente (segunda deleção é sucesso, semântica P2025)', async () => {
      const created = await repository.create(makeInput())
      if (!isOk(created)) throw new Error('setup')
      const { publicId } = created.value

      const first = await repository.delete(publicId)
      const second = await repository.delete(publicId)

      expect(isOk(first)).toBe(true)
      expect(isOk(second)).toBe(true)
      expect(repository.items).toHaveLength(0)
    })
  })

  describe('findPending', () => {
    it('retorna apenas PENDING, ordenado por occurredAt asc, respeitando o limite', async () => {
      const a = await repository.create(makeInput())
      const b = await repository.create(makeInput())
      const c = await repository.create(makeInput())
      const d = await repository.create(makeInput())
      if (!isOk(a) || !isOk(b) || !isOk(c) || !isOk(d)) throw new Error('setup')

      // ordena deterministicamente e move um para SENDING e outro para FAILED
      repository.items[0].occurredAt = new Date('2026-01-01')
      repository.items[1].occurredAt = new Date('2026-01-02')
      repository.items[2].occurredAt = new Date('2026-01-03')
      repository.items[3].occurredAt = new Date('2026-01-04')
      await repository.updateStatus(b.value.publicId, IOutboxEventType.SENDING)
      await repository.updateStatus(c.value.publicId, IOutboxEventType.FAILED)

      const result = await repository.findPending(1)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toHaveLength(1)
      expect(result.value[0].publicId).toBe(a.value.publicId)

      const all = await repository.findPending(10)
      if (!isOk(all)) throw new Error('setup')
      expect(all.value.map((e) => e.publicId)).toEqual([a.value.publicId, d.value.publicId])
    })
  })

  describe('findStuck', () => {
    it('retorna apenas SENDING com sendingAt <= corte, respeitando o limite', async () => {
      const fresh = await repository.create(makeInput())
      const oldA = await repository.create(makeInput())
      const oldB = await repository.create(makeInput())
      const pending = await repository.create(makeInput())
      if (!isOk(fresh) || !isOk(oldA) || !isOk(oldB) || !isOk(pending)) throw new Error('setup')

      await repository.updateStatus(fresh.value.publicId, IOutboxEventType.SENDING)
      await repository.updateStatus(oldA.value.publicId, IOutboxEventType.SENDING)
      await repository.updateStatus(oldB.value.publicId, IOutboxEventType.SENDING)

      const past = new Date(Date.now() - 60 * 60 * 1000)
      repository.items.find((e) => e.publicId === oldA.value.publicId)!.sendingAt = past
      repository.items.find((e) => e.publicId === oldB.value.publicId)!.sendingAt = new Date(past.getTime() + 1000)

      const cutoff = new Date(Date.now() - 30 * 60 * 1000)

      const limited = await repository.findStuck(cutoff, 1)
      expect(isOk(limited)).toBe(true)
      if (!isOk(limited)) return
      expect(limited.value).toHaveLength(1)
      expect(limited.value[0].publicId).toBe(oldA.value.publicId)

      const all = await repository.findStuck(cutoff, 10)
      if (!isOk(all)) throw new Error('setup')
      expect(all.value.map((e) => e.publicId)).toEqual([oldA.value.publicId, oldB.value.publicId])
    })

    it('não retorna eventos revertidos para PENDING mesmo que já tenham sido SENDING (regressão sendingAt obsoleto)', async () => {
      const created = await repository.create(makeInput())
      if (!isOk(created)) throw new Error('setup')
      const { publicId } = created.value

      await repository.updateStatus(publicId, IOutboxEventType.SENDING)
      repository.items[0].sendingAt = new Date(Date.now() - 60 * 60 * 1000)
      await repository.updateStatus(publicId, IOutboxEventType.PENDING)

      const result = await repository.findStuck(new Date(), 10)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toHaveLength(0)
    })
  })

  describe('deleteExpired', () => {
    it('remove apenas eventos com expiresAt <= agora (limite inclusivo) e retorna a contagem', async () => {
      const now = new Date()
      const past = await repository.create(makeExpirableInput(new Date(now.getTime() - 1000)))
      const boundary = await repository.create(makeExpirableInput(now))
      const future = await repository.create(makeExpirableInput(new Date(now.getTime() + 60_000)))
      const form = await repository.create(makeInput())
      if (!isOk(past) || !isOk(boundary) || !isOk(future) || !isOk(form)) throw new Error('setup')

      const result = await repository.deleteExpired(now, 50)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(2)
      expect(repository.items.map((e) => e.publicId)).toEqual([future.value.publicId, form.value.publicId])
    })

    it('remove eventos expirados em qualquer status', async () => {
      const expired = await repository.create(makeExpirableInput(new Date(Date.now() - 1000)))
      if (!isOk(expired)) throw new Error('setup')
      await repository.updateStatus(expired.value.publicId, IOutboxEventType.SENDING)

      const result = await repository.deleteExpired(new Date(), 50)

      expect(isOk(result)).toBe(true)
      if (!isOk(result)) return
      expect(result.value).toBe(1)
      expect(repository.items).toHaveLength(0)
    })

    it('remove no máximo batchSize eventos, ordenados por expiresAt asc', async () => {
      const now = new Date()
      const a = await repository.create(makeExpirableInput(new Date(now.getTime() - 3000)))
      const b = await repository.create(makeExpirableInput(new Date(now.getTime() - 2000)))
      const c = await repository.create(makeExpirableInput(new Date(now.getTime() - 1000)))
      if (!isOk(a) || !isOk(b) || !isOk(c)) throw new Error('setup')

      const firstBatch = await repository.deleteExpired(now, 2)
      expect(isOk(firstBatch)).toBe(true)
      if (!isOk(firstBatch)) return
      expect(firstBatch.value).toBe(2)
      expect(repository.items.map((e) => e.publicId)).toEqual([c.value.publicId])

      const secondBatch = await repository.deleteExpired(now, 2)
      if (!isOk(secondBatch)) throw new Error('setup')
      expect(secondBatch.value).toBe(1)
      expect(repository.items).toHaveLength(0)

      const emptyBatch = await repository.deleteExpired(now, 2)
      if (!isOk(emptyBatch)) throw new Error('setup')
      expect(emptyBatch.value).toBe(0)
    })

    it('retorna err quando a falha é injetada', async () => {
      repository.shouldFailOn.deleteExpired = true

      const result = await repository.deleteExpired(new Date(), 50)

      expect(isErr(result)).toBe(true)
    })
  })

  describe('deleteOlderThan', () => {
    it('remove no máximo batchSize eventos mais antigos que o corte, com contagem por status', async () => {
      const a = await repository.create(makeInput())
      const b = await repository.create(makeInput())
      const c = await repository.create(makeInput())
      const recent = await repository.create(makeInput())
      if (!isOk(a) || !isOk(b) || !isOk(c) || !isOk(recent)) throw new Error('setup')

      const old = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000)
      repository.items[0].occurredAt = old
      repository.items[1].occurredAt = new Date(old.getTime() + 1000)
      repository.items[2].occurredAt = new Date(old.getTime() + 2000)
      await repository.updateStatus(b.value.publicId, IOutboxEventType.SENDING)
      await repository.updateStatus(c.value.publicId, IOutboxEventType.FAILED)

      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

      const firstBatch = await repository.deleteOlderThan(cutoff, 2)
      expect(isOk(firstBatch)).toBe(true)
      if (!isOk(firstBatch)) return
      // Um lote por chamada, ordenado por occurredAt asc
      expect(firstBatch.value.deleted).toBe(2)
      expect(firstBatch.value.byStatus).toEqual({
        [IOutboxEventType.PENDING]: 1,
        [IOutboxEventType.SENDING]: 1,
      })

      const secondBatch = await repository.deleteOlderThan(cutoff, 2)
      if (!isOk(secondBatch)) throw new Error('setup')
      expect(secondBatch.value.deleted).toBe(1)
      expect(secondBatch.value.byStatus).toEqual({ [IOutboxEventType.FAILED]: 1 })

      // O evento recente sobrevive
      expect(repository.items.map((e) => e.publicId)).toEqual([recent.value.publicId])

      const emptyBatch = await repository.deleteOlderThan(cutoff, 2)
      if (!isOk(emptyBatch)) throw new Error('setup')
      expect(emptyBatch.value).toEqual({ deleted: 0, byStatus: {} })
    })

    it('retorna err quando a falha é injetada', async () => {
      repository.shouldFailOn.deleteOlderThan = true

      const result = await repository.deleteOlderThan(new Date(), 10)

      expect(isErr(result)).toBe(true)
    })
  })
})
