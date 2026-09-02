import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OutboxEventUseCase } from './outbox-event-use-case'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutboxEventStatus,
} from 'core/contracts/repository/outbox-repository.interface'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'
import { ok, err, isErr } from 'core/shared/result'
import { OutboxOperationFailedInfraError } from '@use-cases/errors/outbox/outbox-errors'
import { Prisma } from '@prisma/client'

function makeRepository(): IOutboxRepository {
  return {
    create: vi.fn(),
    findPending: vi.fn(),
    findStuck: vi.fn(),
    findByPublicId: vi.fn(),
    updateStatus: vi.fn(),
    updatePendingRecipients: vi.fn(),
    delete: vi.fn(),
    deleteExpired: vi.fn(),
    deleteOlderThan: vi.fn(),
  }
}

const persisted: IOutboxEvent = {
  id: 1,
  publicId: 'evt-1',
  type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
  status: IOutboxEventStatus.PENDING,
  payload: {},
  attempts: 0,
  occurredAt: new Date('2026-01-01T00:00:00Z'),
  sendingAt: undefined,
  expiresAt: undefined,
  pendingRecipients: [],
}

describe('OutboxEventUseCase', () => {
  let repository: IOutboxRepository
  let useCase: OutboxEventUseCase

  beforeEach(() => {
    repository = makeRepository()
    useCase = new OutboxEventUseCase(repository)
  })

  it('persists the event with PENDING status and the caller payload', async () => {
    vi.mocked(repository.create).mockResolvedValue(ok(persisted))

    const input = {
      type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
      payload: { name: 'Ana', email: 'ana@example.com' },
    } as const

    await useCase.register(input)

    expect(repository.create).toHaveBeenCalledWith({
      status: IOutboxEventStatus.PENDING,
      type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
      payload: { name: 'Ana', email: 'ana@example.com' },
    })
  })

  it('forwards expiresAt for expirable event types', async () => {
    vi.mocked(repository.create).mockResolvedValue(ok(persisted))
    const expiresAt = new Date('2026-02-01T00:00:00Z')

    await useCase.register({
      type: OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED,
      payload: {
        userPublicId: 'u-1',
        name: 'Ana',
        email: 'ana@example.com',
        token: 'raw-token',
        tokenExpiresAt: expiresAt.toISOString(),
      },
      expiresAt,
    })

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: IOutboxEventStatus.PENDING, expiresAt }),
    )
  })

  it('returns the repository success Result verbatim', async () => {
    const success = ok(persisted)
    vi.mocked(repository.create).mockResolvedValue(success)

    const result = await useCase.register({
      type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
      payload: {},
    } as never)

    expect(result).toBe(success)
  })

  it('propagates a repository failure Result without wrapping it', async () => {
    const failure = err(
      new OutboxOperationFailedInfraError(
        new Prisma.PrismaClientKnownRequestError('fk', { code: 'P2003', clientVersion: '7' }),
      ),
    )
    vi.mocked(repository.create).mockResolvedValue(failure)

    const result = await useCase.register({
      type: OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED,
      payload: {},
    } as never)

    expect(isErr(result)).toBe(true)
    expect(result).toBe(failure)
  })
})
