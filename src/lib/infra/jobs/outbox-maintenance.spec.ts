import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@lib/logger', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger }
})

const mockAcquire = vi.fn()
const mockRenew = vi.fn()
const mockRelease = vi.fn()

vi.mock('@lib/infra/distributed-lock/distributed-lock', () => ({
  DistributedLock: {
    acquire: (...args: unknown[]) => mockAcquire(...args),
    renew: (...args: unknown[]) => mockRenew(...args),
    release: (...args: unknown[]) => mockRelease(...args),
  },
}))

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

import { OutboxMaintenance } from './outbox-maintenance'
import { IOutboxRepository, IOutboxEventType } from 'core/contracts/repository/outbox-repository.interface'
import { ok, err } from 'core/shared/result'
import { OUTBOX_CONSTANTS } from 'messages/constants/outbox/outbox'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { logger } from '@lib/logger'
import { InfrastructureError } from 'errors/infrastructure-error'

class InfraTestError extends InfrastructureError {
  constructor() {
    super({ code: 'INFRA_TEST_ERROR', message: 'falha de infra injetada' })
  }
}

function makeRepository() {
  return {
    deleteExpired: vi.fn().mockResolvedValue(ok(0)),
    deleteOlderThan: vi.fn().mockResolvedValue(ok({ deleted: 0, byStatus: {} })),
  }
}

describe('OutboxMaintenance', () => {
  let repository: ReturnType<typeof makeRepository>
  let maintenance: OutboxMaintenance

  beforeEach(() => {
    vi.clearAllMocks()
    repository = makeRepository()
    maintenance = new OutboxMaintenance(repository as unknown as IOutboxRepository)

    mockAcquire.mockResolvedValue('lock-token')
    mockRenew.mockResolvedValue(true)
    mockRelease.mockResolvedValue(undefined)
  })

  describe('sweepExpiredEvents', () => {
    it('adquire o lock de expiração, deleta expirados e libera o lock', async () => {
      repository.deleteExpired.mockResolvedValueOnce(ok(3))

      await maintenance.sweepExpiredEvents()

      expect(mockAcquire).toHaveBeenCalledWith(
        OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_EXPIRY_SWEEP,
        OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT,
      )
      expect(repository.deleteExpired).toHaveBeenCalledExactlyOnceWith(expect.any(Date))
      expect(logger.info).toHaveBeenCalledWith({ deleted: 3 }, OUTBOX_LOGS.EXPIRY_SWEEP_DELETED)
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('nada expirado (0 deletados): não loga', async () => {
      await maintenance.sweepExpiredEvents()

      expect(logger.info).not.toHaveBeenCalled()
    })

    it('lock não adquirido: retorna sem consultar o repositório', async () => {
      mockAcquire.mockResolvedValueOnce(null)

      await maintenance.sweepExpiredEvents()

      expect(repository.deleteExpired).not.toHaveBeenCalled()
      expect(mockRelease).not.toHaveBeenCalled()
    })

    it('falha do repositório: loga, captura no Sentry e libera o lock', async () => {
      const infraError = new InfraTestError()
      repository.deleteExpired.mockResolvedValueOnce(err(infraError))

      await maintenance.sweepExpiredEvents()

      expect(logger.error).toHaveBeenCalledWith({ error: infraError }, OUTBOX_LOGS.EXPIRY_SWEEP_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(infraError)
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('rejeição inesperada: loga, captura e ainda libera o lock', async () => {
      repository.deleteExpired.mockRejectedValueOnce(new Error('estouro'))

      await expect(maintenance.sweepExpiredEvents()).resolves.toBeUndefined()

      expect(mockCaptureError).toHaveBeenCalledOnce()
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })

  describe('purgeOldEvents', () => {
    const BATCH = OUTBOX_CONSTANTS.RETENTION.BATCH_SIZE

    it('usa corte de RETENTION.DAYS dias e o lock de retenção', async () => {
      const before = Date.now()

      await maintenance.purgeOldEvents()

      expect(mockAcquire).toHaveBeenCalledWith(
        OUTBOX_CONSTANTS.LOCK_KEYS.OUTBOX_RETENTION,
        OUTBOX_CONSTANTS.LOCK_TTL_MS.DEFAULT,
      )
      const [cutoff, batchSize] = repository.deleteOlderThan.mock.calls[0]
      const expected = before - OUTBOX_CONSTANTS.RETENTION.DAYS * 24 * 60 * 60 * 1000
      expect(Math.abs(cutoff.getTime() - expected)).toBeLessThan(5_000)
      expect(batchSize).toBe(BATCH)
    })

    it('itera em lotes até um lote parcial, renovando o lock a cada lote', async () => {
      repository.deleteOlderThan
        .mockResolvedValueOnce(ok({ deleted: BATCH, byStatus: { [IOutboxEventType.FAILED]: BATCH } }))
        .mockResolvedValueOnce(ok({ deleted: BATCH, byStatus: { [IOutboxEventType.FAILED]: BATCH } }))
        .mockResolvedValueOnce(ok({ deleted: 10, byStatus: { [IOutboxEventType.FAILED]: 10 } }))

      await maintenance.purgeOldEvents()

      expect(repository.deleteOlderThan).toHaveBeenCalledTimes(3)
      expect(mockRenew).toHaveBeenCalledTimes(3)
      expect(logger.info).toHaveBeenCalledWith(
        { deleted: 2 * BATCH + 10, byStatus: { [IOutboxEventType.FAILED]: 2 * BATCH + 10 } },
        OUTBOX_LOGS.RETENTION_PURGED,
      )
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('purga de PENDING/SENDING antigos: loga em warn com o detalhamento por status', async () => {
      repository.deleteOlderThan.mockResolvedValueOnce(
        ok({
          deleted: 5,
          byStatus: {
            [IOutboxEventType.FAILED]: 2,
            [IOutboxEventType.PENDING]: 2,
            [IOutboxEventType.SENDING]: 1,
          },
        }),
      )

      await maintenance.purgeOldEvents()

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ deleted: 5 }),
        OUTBOX_LOGS.RETENTION_PURGED_NON_TERMINAL,
      )
      expect(logger.info).not.toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.RETENTION_PURGED)
    })

    it('nada purgado: não loga resumo', async () => {
      await maintenance.purgeOldEvents()

      expect(logger.info).not.toHaveBeenCalled()
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('lock não adquirido: retorna sem consultar o repositório', async () => {
      mockAcquire.mockResolvedValueOnce(null)

      await maintenance.purgeOldEvents()

      expect(repository.deleteOlderThan).not.toHaveBeenCalled()
    })

    it('falha do repositório no meio dos lotes: para o loop, loga, captura e libera o lock', async () => {
      const infraError = new InfraTestError()
      repository.deleteOlderThan
        .mockResolvedValueOnce(ok({ deleted: BATCH, byStatus: { [IOutboxEventType.FAILED]: BATCH } }))
        .mockResolvedValueOnce(err(infraError))

      await maintenance.purgeOldEvents()

      expect(repository.deleteOlderThan).toHaveBeenCalledTimes(2)
      expect(logger.error).toHaveBeenCalledWith({ error: infraError }, OUTBOX_LOGS.RETENTION_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(infraError)
      // o que já foi purgado antes da falha ainda é reportado
      expect(logger.info).toHaveBeenCalledWith(
        { deleted: BATCH, byStatus: { [IOutboxEventType.FAILED]: BATCH } },
        OUTBOX_LOGS.RETENTION_PURGED,
      )
      expect(mockRelease).toHaveBeenCalledOnce()
    })

    it('rejeição inesperada (renew rejeita): loga, captura e ainda libera o lock', async () => {
      mockRenew.mockRejectedValueOnce(new Error('conexão perdida'))

      await expect(maintenance.purgeOldEvents()).resolves.toBeUndefined()

      expect(logger.error).toHaveBeenCalledWith(expect.anything(), OUTBOX_LOGS.RETENTION_ERROR)
      expect(mockCaptureError).toHaveBeenCalledOnce()
      expect(mockRelease).toHaveBeenCalledOnce()
    })
  })
})
