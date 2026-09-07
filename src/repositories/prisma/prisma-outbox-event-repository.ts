import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { Prisma } from '@prisma/client'
import { err, ok, Result } from 'core/shared/result'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutBoxEventInputData,
  IOutboxEventStatus,
} from 'core/contracts/repository/outbox-repository.interface'
import { AppError } from 'errors/app-error'

export class PrismaOutboxRepository implements IOutboxRepository {
  constructor(
    private readonly dbContext: DatabaseContext,
    private readonly httpErrorMapper: PrismaErrorMapper<AppError>,
    private readonly infraErrorMapper: PrismaErrorMapper<AppError>,
  ) {}

  async create(data: IOutBoxEventInputData): Promise<Result<IOutboxEvent, AppError>> {
    try {
      const outboxEvent = await this.dbContext.client.outboxEvent.create({
        data: {
          type: data.type,
          status: data.status,
          payload: data.payload,
          expiresAt: data.expiresAt ?? null,
        },
      })

      return ok(this.toEntity(outboxEvent))
    } catch (error) {
      return err(this.httpErrorMapper.mapToKnownError(error))
    }
  }

  async findPending(limit: number): Promise<Result<IOutboxEvent[], AppError>> {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: { status: IOutboxEventStatus.PENDING },
        orderBy: { occurredAt: 'asc' },
        take: limit,
      })

      return ok(events.map((e) => this.toEntity(e)))
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async findStuck(stuckBefore: Date, limit: number): Promise<Result<IOutboxEvent[], AppError>> {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: {
          status: IOutboxEventStatus.SENDING,
          sendingAt: { lte: stuckBefore },
        },
        orderBy: { sendingAt: 'asc' },
        take: limit,
      })

      return ok(events.map((e) => this.toEntity(e)))
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async findByPublicId(publicId: string): Promise<Result<IOutboxEvent | null, AppError>> {
    try {
      const event = await this.dbContext.client.outboxEvent.findUnique({
        where: { publicId },
      })

      return ok(event ? this.toEntity(event) : null)
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async updateStatus(publicId: string, status: IOutboxEventStatus): Promise<Result<void, AppError>> {
    try {
      await this.dbContext.client.outboxEvent.update({
        where: { publicId },
        data: {
          status,
          // SENDING marca o início do ciclo de despacho; demais status limpam o marcador
          ...(status === IOutboxEventStatus.SENDING
            ? { sendingAt: new Date(), attempts: { increment: 1 } }
            : { sendingAt: null }),
        },
      })
      return ok(undefined)
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async updatePendingRecipients(publicId: string, pendingRecipients: string[]): Promise<Result<void, AppError>> {
    try {
      await this.dbContext.client.outboxEvent.update({
        where: { publicId },
        data: { pendingRecipients },
      })
      return ok(undefined)
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async delete(publicId: string): Promise<Result<void, AppError>> {
    try {
      await this.dbContext.client.outboxEvent.delete({
        where: { publicId },
      })
      return ok(undefined)
    } catch (error) {
      // Idempotente: linha já removida (P2025) conta como sucesso
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return ok(undefined)
      }
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async deleteExpired(now: Date, batchSize: number): Promise<Result<number, AppError>> {
    try {
      // Mesmo padrão de deleteOlderThan: busca um lote de ids e deleta por id,
      // limitando o tempo de lock caso a varredura de expiração fique muito tempo parada.
      const batch = await this.dbContext.client.outboxEvent.findMany({
        where: { expiresAt: { lte: now } },
        select: { id: true },
        orderBy: { expiresAt: 'asc' },
        take: batchSize,
      })

      if (batch.length === 0) {
        return ok(0)
      }

      const result = await this.dbContext.client.outboxEvent.deleteMany({
        where: { id: { in: batch.map((e) => e.id) } },
      })

      return ok(result.count)
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async deleteOlderThan(
    cutoff: Date,
    batchSize: number,
  ): Promise<Result<{ deleted: number; byStatus: Partial<Record<IOutboxEventStatus, number>> }, AppError>> {
    try {
      // deleteMany não aceita `take`: busca um lote de ids e deleta por id,
      // mantendo o tempo de lock e o churn de WAL limitados em tabelas grandes.
      const batch = await this.dbContext.client.outboxEvent.findMany({
        where: { occurredAt: { lt: cutoff } },
        select: { id: true, status: true },
        orderBy: { occurredAt: 'asc' },
        take: batchSize,
      })

      if (batch.length === 0) {
        return ok({ deleted: 0, byStatus: {} })
      }

      const result = await this.dbContext.client.outboxEvent.deleteMany({
        where: { id: { in: batch.map((e) => e.id) } },
      })

      const byStatus: Partial<Record<IOutboxEventStatus, number>> = {}
      for (const event of batch) {
        const status = event.status as IOutboxEventStatus
        byStatus[status] = (byStatus[status] ?? 0) + 1
      }

      return ok({ deleted: result.count, byStatus })
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────────

  private toEntity(raw: {
    id: number
    publicId: string
    type: string
    status: string
    payload: unknown
    attempts: number
    occurredAt: Date
    sendingAt: Date | null
    expiresAt: Date | null
    pendingRecipients: string[]
  }): IOutboxEvent {
    return {
      id: raw.id,
      publicId: raw.publicId,
      type: raw.type,
      status: raw.status as IOutboxEventStatus,
      payload: raw.payload,
      attempts: raw.attempts,
      occurredAt: raw.occurredAt,
      sendingAt: raw.sendingAt || undefined,
      expiresAt: raw.expiresAt || undefined,
      pendingRecipients: raw.pendingRecipients,
    }
  }
}
