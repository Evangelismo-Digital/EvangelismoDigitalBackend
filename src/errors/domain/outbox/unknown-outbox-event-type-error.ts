import { InfrastructureError } from 'errors/infrastructure-error'
import { UNKNOWN_OUTBOX_EVENT_TYPE_ERROR_FN } from 'messages/errors/outbox'

/**
 * Lançado no despacho quando o tipo do evento não tem estratégia registrada.
 * Segue o caminho de poison message: reversão para PENDING e, após o limite
 * de ciclos de despacho, transição terminal para FAILED.
 */
export class UnknownOutboxEventTypeError extends InfrastructureError {
  constructor(eventType: string) {
    super(UNKNOWN_OUTBOX_EVENT_TYPE_ERROR_FN(eventType))
  }
}
