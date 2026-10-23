import { Result } from '@common/utils/result'
import { OutboxEventInput } from '@infra/outbox/interfaces/outbox-event-input'
import { AppError } from '@common/errors/app-error'

/**
 * Status do evento na Outbox.
 *
 * Máquina de estados:
 * - PENDING  → SENDING  (despacho: seta sendingAt e incrementa attempts)
 * - SENDING  → deletado (envio confirmado pelo mail worker)
 * - SENDING  → PENDING  (falha de despacho ou falha definitiva do job; sendingAt é limpo)
 * - qualquer → FAILED   (terminal: attempts excedeu o limite de ciclos de despacho)
 */
export enum IOutboxEventStatus {
  PENDING = 'PENDING',
  SENDING = 'SENDING',
  FAILED = 'FAILED',
}

export type IOutBoxEventInputData = { status: IOutboxEventStatus } & OutboxEventInput

export interface IOutboxEvent {
  id: number
  publicId: string
  type: string
  status: IOutboxEventStatus
  payload: unknown
  attempts: number
  occurredAt: Date
  sendingAt: Date | undefined
  /** Eventos expiráveis (ex.: reset de senha) nunca são despachados após este instante. */
  expiresAt: Date | undefined
  /**
   * Retry seletivo de lote: vazio = despacha o lote completo; não-vazio = re-tenta
   * apenas os destinatários (campo `to`) que falharam num envio parcial anterior.
   */
  pendingRecipients: string[]
}

export interface OutboxClaimFilter {
  readonly publicId: string
  readonly fromStatus: IOutboxEventStatus
  readonly stuckBefore?: Date
}

export interface IOutboxRepository {
  create(data: IOutBoxEventInputData): Promise<Result<IOutboxEvent, AppError>>
  findPending(limit: number): Promise<Result<IOutboxEvent[], AppError>>
  findStuck(stuckBefore: Date, limit: number): Promise<Result<IOutboxEvent[], AppError>>
  findFailed(limit: number): Promise<Result<IOutboxEvent[], AppError>>
  findByPublicId(publicId: string): Promise<Result<IOutboxEvent | null, AppError>>
  /**
   * Re-tenta um evento FAILED (Dead-Letter / Poison), resetando seu status para
   * PENDING, limpando sendingAt e zerando attempts para um novo ciclo de despacho.
   * Retorna ok(true) se o evento estava FAILED e foi resetado, ou ok(false) caso contrário.
   */
  retryFailed(publicId: string): Promise<Result<boolean, AppError>>
  /**
   * Reivindicação atômica Compare-And-Set (CAS).
   * Atualiza o evento de `fromStatus` (e `sendingAt <= stuckBefore` quando fornecido)
   * para `SENDING`, atribuindo `sendingAt = now()` e incrementando `attempts`.
   * Retorna `ok(true)` se exatamente 1 registro foi atualizado (vitória no lock otimista),
   * ou `ok(false)` caso o filtro não case (outro worker ou varredura já assumiu o evento).
   */
  claim(filter: OutboxClaimFilter): Promise<Result<boolean, AppError>>
  /**
   * Transição de status. Para SENDING seta sendingAt=now e incrementa attempts;
   * para PENDING/FAILED limpa sendingAt.
   */
  updateStatus(publicId: string, status: IOutboxEventStatus): Promise<Result<void, AppError>>
  /**
   * Persiste o subconjunto de destinatários pendentes (retry seletivo de lote).
   * Chamado pelo mail worker numa falha parcial para que o re-despacho do Outbox
   * envie apenas os `to` que ainda não foram entregues.
   */
  updatePendingRecipients(publicId: string, pendingRecipients: string[]): Promise<Result<void, AppError>>
  /** Idempotente: deletar um evento inexistente é sucesso. */
  delete(publicId: string): Promise<Result<void, AppError>>
  /**
   * Remove ATÉ batchSize eventos cujo expiresAt já passou (qualquer status), um lote
   * por chamada — mesmo padrão de deleteOlderThan, para o chamador renovar o lock
   * distribuído entre lotes. Retorna a quantidade removida no lote.
   */
  deleteExpired(now: Date, batchSize: number): Promise<Result<number, AppError>>
  /**
   * Remove ATÉ batchSize eventos com status FAILED e occurredAt < cutoff.
   * Retorna a quantidade removida no lote.
   */
  deleteFailedOlderThan(cutoff: Date, batchSize: number): Promise<Result<number, AppError>>
  /**
   * Remove ATÉ batchSize eventos com occurredAt < cutoff (um lote por chamada,
   * para o chamador renovar o lock distribuído entre lotes). Retorna o total
   * removido e a contagem por status para observabilidade.
   */
  deleteOlderThan(
    cutoff: Date,
    batchSize: number,
  ): Promise<Result<{ deleted: number; byStatus: Partial<Record<IOutboxEventStatus, number>> }, AppError>>
}
