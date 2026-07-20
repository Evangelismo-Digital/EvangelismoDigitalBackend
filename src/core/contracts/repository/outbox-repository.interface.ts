import { Result } from 'core/shared/result'
import { OutboxEventInput } from 'core/types/outbox/outbox-event-input'
import { AppError } from 'errors/app-error'

/**
 * Status do evento na Outbox (o enum Prisma correspondente chama-se OutboxEventType
 * por compatibilidade de migração, mas modela o *status*).
 *
 * Máquina de estados:
 * - PENDING  → SENDING  (despacho: seta sendingAt e incrementa attempts)
 * - SENDING  → deletado (envio confirmado pelo mail worker)
 * - SENDING  → PENDING  (falha de despacho ou falha definitiva do job; sendingAt é limpo)
 * - qualquer → FAILED   (terminal: attempts excedeu o limite de ciclos de despacho)
 */
export enum IOutboxEventType {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  FAILED = 'FAILED',
}

export type IOutBoxEventInputData = { status: IOutboxEventType } & OutboxEventInput

export interface IOutboxEvent {
  id: number
  publicId: string
  type: string
  status: IOutboxEventType
  payload: unknown
  attempts: number
  occurredAt: Date
  sendingAt: Date | undefined
  /** Eventos expiráveis (ex.: reset de senha) nunca são despachados após este instante. */
  expiresAt: Date | undefined
}

export interface IOutboxRepository {
  create(data: IOutBoxEventInputData): Promise<Result<IOutboxEvent, AppError>>
  findPending(limit: number): Promise<Result<IOutboxEvent[], AppError>>
  findStuck(stuckBefore: Date, limit: number): Promise<Result<IOutboxEvent[], AppError>>
  findByPublicId(publicId: string): Promise<Result<IOutboxEvent | null, AppError>>
  /**
   * Transição de status. Para SENDING seta sendingAt=now e incrementa attempts;
   * para PENDING/FAILED limpa sendingAt.
   */
  updateStatus(publicId: string, status: IOutboxEventType): Promise<Result<void, AppError>>
  /** Idempotente: deletar um evento inexistente é sucesso. */
  delete(publicId: string): Promise<Result<void, AppError>>
  /** Remove eventos cujo expiresAt já passou (qualquer status). Retorna a quantidade removida. */
  deleteExpired(now: Date): Promise<Result<number, AppError>>
  /**
   * Remove ATÉ batchSize eventos com occurredAt < cutoff (um lote por chamada,
   * para o chamador renovar o lock distribuído entre lotes). Retorna o total
   * removido e a contagem por status para observabilidade.
   */
  deleteOlderThan(
    cutoff: Date,
    batchSize: number,
  ): Promise<Result<{ deleted: number; byStatus: Partial<Record<IOutboxEventType, number>> }, AppError>>
}
