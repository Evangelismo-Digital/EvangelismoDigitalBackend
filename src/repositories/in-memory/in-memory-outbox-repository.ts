import { randomUUID } from 'node:crypto'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutBoxEventInputData,
  IOutboxEventType,
} from 'core/contracts/repository/outbox-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InfrastructureError } from 'errors/infrastructure-error'

class InMemoryOutboxError extends InfrastructureError {
  constructor(message: string) {
    super({ code: 'IN_MEMORY_OUTBOX_ERROR', message })
  }
}

interface FailureInjection {
  create?: boolean
  findPending?: boolean
  findStuck?: boolean
  updateStatus?: boolean
  delete?: boolean
}

/**
 * Dublê de teste com a mesma semântica do PrismaOutboxRepository:
 * - updateStatus(SENDING) seta sendingAt e incrementa attempts
 * - updateStatus(PENDING | FAILED) limpa sendingAt
 * - delete é idempotente (linha inexistente = sucesso, semântica P2025)
 * Use `shouldFailOn` para injetar falhas de infraestrutura por método.
 */
export class InMemoryOutboxRepository implements IOutboxRepository {
  public items: IOutboxEvent[] = []
  public shouldFailOn: FailureInjection = {}

  private nextId = 1

  async create(data: IOutBoxEventInputData): Promise<Result<IOutboxEvent, AppError>> {
    if (this.shouldFailOn.create) {
      return err(new InMemoryOutboxError('Falha injetada em create'))
    }

    const event: IOutboxEvent = {
      id: this.nextId++,
      publicId: randomUUID(),
      type: data.type,
      status: data.status,
      payload: data.payload,
      attempts: 0,
      occurredAt: new Date(),
      sendingAt: undefined,
    }

    this.items.push(event)

    return ok(event)
  }

  async findPending(limit: number): Promise<Result<IOutboxEvent[], AppError>> {
    if (this.shouldFailOn.findPending) {
      return err(new InMemoryOutboxError('Falha injetada em findPending'))
    }

    const pending = this.items
      .filter((e) => e.status === IOutboxEventType.PENDING)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(0, limit)

    return ok(pending)
  }

  async findStuck(stuckBefore: Date, limit: number): Promise<Result<IOutboxEvent[], AppError>> {
    if (this.shouldFailOn.findStuck) {
      return err(new InMemoryOutboxError('Falha injetada em findStuck'))
    }

    const stuck = this.items
      .filter(
        (e) =>
          e.status === IOutboxEventType.SENDING &&
          e.sendingAt !== undefined &&
          e.sendingAt.getTime() <= stuckBefore.getTime(),
      )
      .sort((a, b) => (a.sendingAt?.getTime() ?? 0) - (b.sendingAt?.getTime() ?? 0))
      .slice(0, limit)

    return ok(stuck)
  }

  async findByPublicId(publicId: string): Promise<Result<IOutboxEvent | null, AppError>> {
    const event = this.items.find((e) => e.publicId === publicId)

    return ok(event ?? null)
  }

  async updateStatus(publicId: string, status: IOutboxEventType): Promise<Result<void, AppError>> {
    if (this.shouldFailOn.updateStatus) {
      return err(new InMemoryOutboxError('Falha injetada em updateStatus'))
    }

    const event = this.items.find((e) => e.publicId === publicId)

    if (!event) {
      return err(new InMemoryOutboxError('Evento não encontrado para atualização de status'))
    }

    event.status = status

    if (status === IOutboxEventType.SENDING) {
      event.sendingAt = new Date()
      event.attempts += 1
    } else {
      event.sendingAt = undefined
    }

    return ok(undefined)
  }

  async delete(publicId: string): Promise<Result<void, AppError>> {
    if (this.shouldFailOn.delete) {
      return err(new InMemoryOutboxError('Falha injetada em delete'))
    }

    // Idempotente: deletar evento inexistente é sucesso (semântica P2025 do Prisma)
    this.items = this.items.filter((e) => e.publicId !== publicId)

    return ok(undefined)
  }
}
