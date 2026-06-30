import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { Prisma } from '@prisma/client'
import { err, ok, Result } from 'core/shared/result'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutBoxEventInputData,
  IOutboxEventType,
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
          payload: data.payload as Prisma.InputJsonValue,
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
        where: { status: IOutboxEventType.PENDING },
        orderBy: { occurredAt: 'asc' },
        take: limit,
      })

      return ok(events.map((e) => this.toEntity(e)))
    } catch (error) {
      return err(this.infraErrorMapper.mapToKnownError(error))
    }
  }

  async findStuck(stuckBefore: Date): Promise<Result<IOutboxEvent[], AppError>> {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: {
          status: IOutboxEventType.SENDING,
          sendingAt: { lte: stuckBefore },
        },
        orderBy: { sendingAt: 'asc' },
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

  async updateStatus(publicId: string, status: IOutboxEventType): Promise<Result<void, AppError>> {
    try {
      await this.dbContext.client.outboxEvent.update({
        where: { publicId },
        data: {
          status,
          ...(status === IOutboxEventType.SENDING && { sendingAt: new Date() }),
        },
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
    occurredAt: Date
    sendingAt: Date | null
  }): IOutboxEvent {
    return {
      id: raw.id,
      publicId: raw.publicId,
      type: raw.type,
      status: raw.status as IOutboxEventType,
      payload: raw.payload,
      occurredAt: raw.occurredAt,
      sendingAt: raw.sendingAt || undefined,
    }
  }
}
