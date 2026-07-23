import { describe, it, expect } from 'vitest'
import { OutboxDispatchStrategyRegistry } from './outbox-dispatch-strategy-registry'
import { UnknownOutboxEventTypeError } from '@lib/errors/outbox/unknown-outbox-event-type-error'
import { IOutboxDispatchStrategy } from 'core/contracts/lib/infra/outbox-dispatch-strategy.interface'
import { isOk, isErr, ok } from 'core/shared/result'

const stubStrategy: IOutboxDispatchStrategy = {
  buildDispatch: () => ok({ emails: [] }),
}

describe('OutboxDispatchStrategyRegistry', () => {
  it('resolve retorna a estratégia registrada para o tipo', () => {
    const registry = new OutboxDispatchStrategyRegistry([['FormSubmissionCreated', stubStrategy]])

    const result = registry.resolve('FormSubmissionCreated')

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value).toBe(stubStrategy)
  })

  it('resolve retorna err(UnknownOutboxEventTypeError) para tipo não registrado', () => {
    const registry = new OutboxDispatchStrategyRegistry([['FormSubmissionCreated', stubStrategy]])

    const result = registry.resolve('TipoInexistente')

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBeInstanceOf(UnknownOutboxEventTypeError)
    expect(result.error.body.message).toContain('TipoInexistente')
  })
})
