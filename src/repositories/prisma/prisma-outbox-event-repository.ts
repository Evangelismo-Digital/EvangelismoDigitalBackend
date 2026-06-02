import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { Prisma } from '@prisma/client'
import { outboxErrorMapping } from '@use-cases/errors/outbox/outbox-error-mapper'
import { err, ok, Result } from 'core/shared/result'
import {
  IOutboxRepository,
  IOutboxEvent,
  IOutBoxEventInputData,
  IOutboxEventType,
} from 'core/contracts/repository/outbox-repository.interface'

export class PrismaOutboxRepository implements IOutboxRepository {
  private httpErrorMapper = new PrismaErrorMapper(outboxErrorMapping.http)
  private infraErrorMapper = new PrismaErrorMapper(outboxErrorMapping.infra)

  constructor(private readonly dbContext: DatabaseContext) {}

  async create(data: IOutBoxEventInputData): Promise<Result<IOutboxEvent, Error>> {
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
      const mappedError = this.httpErrorMapper.mapToKnownError(error)
      return err(mappedError)
    }
  }

  async findPending(limit: number): Promise<Result<IOutboxEvent[], Error>> {
    try {
      const events = await this.dbContext.client.outboxEvent.findMany({
        where: { status: IOutboxEventType.PENDING },
        orderBy: { occurredAt: 'asc' },
        take: limit,
      })

      return ok(events.map((e) => this.toEntity(e)))
    } catch (error) {
      // Buscas feitas pelo Cron: usa InfraError
      const infraMappedError = this.infraErrorMapper.mapToKnownError(error)
      return err(infraMappedError)
    }
  }

  async findStuck(stuckBefore: Date): Promise<Result<IOutboxEvent[], Error>> {
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
      const infraMappedError = this.infraErrorMapper.mapToKnownError(error)
      return err(infraMappedError)
    }
  }

  async findByPublicId(publicId: string): Promise<Result<IOutboxEvent | null, Error>> {
    try {
      const event = await this.dbContext.client.outboxEvent.findUnique({
        where: { publicId },
      })

      return ok(event ? this.toEntity(event) : null)
    } catch (error) {
      const infraMappedError = this.infraErrorMapper.mapToKnownError(error)
      return err(infraMappedError)
    }
  }

  async updateStatus(publicId: string, status: IOutboxEventType): Promise<Result<void, Error>> {
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
      const infraMappedError = this.infraErrorMapper.mapToKnownError(error)
      return err(infraMappedError)
    }
  }

  async delete(publicId: string): Promise<Result<void, Error>> {
    try {
      await this.dbContext.client.outboxEvent.delete({
        where: { publicId },
      })
      return ok(undefined)
    } catch (error) {
      const infraMappedError = this.infraErrorMapper.mapToKnownError(error)
      return err(infraMappedError)
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
