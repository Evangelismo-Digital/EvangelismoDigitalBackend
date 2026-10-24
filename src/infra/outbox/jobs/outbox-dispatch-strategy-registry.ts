import { IOutboxDispatchStrategy } from '@infra/outbox/interfaces/outbox-dispatch-strategy.interface'
import { UnknownOutboxEventTypeError } from '@infra/outbox/errors/unknown-outbox-event-type-error'
import { Result, ok, err } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

/**
 * Registro de estratégias de despacho por tipo de evento da Outbox.
 * Adicionar um novo tipo de evento = registrar uma estratégia aqui
 * (ver make-outbox-dispatch-registry.ts) — sem branching no processor.
 */
export class OutboxDispatchStrategyRegistry {
  private readonly strategies: Map<string, IOutboxDispatchStrategy>

  constructor(entries: ReadonlyArray<readonly [string, IOutboxDispatchStrategy]>) {
    this.strategies = new Map(entries)
  }

  resolve(eventType: string): Result<IOutboxDispatchStrategy, AppError> {
    const strategy = this.strategies.get(eventType)

    if (!strategy) {
      return err(new UnknownOutboxEventTypeError(eventType))
    }

    return ok(strategy)
  }
}
