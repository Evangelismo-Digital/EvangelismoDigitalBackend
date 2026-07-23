import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FormSubmissionDispatchStrategy } from './form-submission-dispatch-strategy'
import { ContactEmailStrategy } from './contact-email-strategy'
import { DecisionForChristEmailStrategy } from './decision-for-christ-email-strategy'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { isOk, isErr, err } from 'core/shared/result'
import { InvalidFormPayloadError } from '@use-cases/errors/forms/invalid-form-payload-error'

function makeEvent(payload: Record<string, unknown>): IOutboxEvent {
  return {
    id: 1,
    publicId: 'evt-1',
    type: 'FormSubmissionCreated',
    status: IOutboxEventStatus.PENDING,
    payload,
    attempts: 0,
    occurredAt: new Date(),
    sendingAt: undefined,
    expiresAt: undefined,
    pendingRecipients: [],
  }
}

const basePayload = {
  name: 'João',
  lastName: 'Silva',
  email: 'joao@test.com',
  decisaoPorCristo: false,
}

describe('FormSubmissionDispatchStrategy', () => {
  let strategy: FormSubmissionDispatchStrategy

  beforeEach(() => {
    vi.restoreAllMocks()
    strategy = new FormSubmissionDispatchStrategy()
  })

  it('monta dois e-mails (usuário + equipe) sem jobOptions (defaults da fila)', () => {
    const result = strategy.buildDispatch(makeEvent(basePayload))

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.emails).toHaveLength(2)
    expect(result.value.emails[0].to).toBe('joao@test.com')
    expect(result.value.jobOptions).toBeUndefined()
  })

  it('roteia decisaoPorCristo=true para DecisionForChristEmailStrategy', () => {
    const decisionSpy = vi.spyOn(DecisionForChristEmailStrategy.prototype, 'buildUserEmail')
    const contactSpy = vi.spyOn(ContactEmailStrategy.prototype, 'buildUserEmail')

    strategy.buildDispatch(makeEvent({ ...basePayload, decisaoPorCristo: true }))

    expect(decisionSpy).toHaveBeenCalledOnce()
    expect(contactSpy).not.toHaveBeenCalled()
  })

  it('roteia decisaoPorCristo=false para ContactEmailStrategy', () => {
    const decisionSpy = vi.spyOn(DecisionForChristEmailStrategy.prototype, 'buildUserEmail')
    const contactSpy = vi.spyOn(ContactEmailStrategy.prototype, 'buildUserEmail')

    strategy.buildDispatch(makeEvent(basePayload))

    expect(contactSpy).toHaveBeenCalledOnce()
    expect(decisionSpy).not.toHaveBeenCalled()
  })

  it('payload inválido (email ausente): propaga err(InvalidFormPayloadError)', () => {
    const result = strategy.buildDispatch(makeEvent({ name: 'João', decisaoPorCristo: false }))

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBeInstanceOf(InvalidFormPayloadError)
  })

  it('falha no e-mail da equipe: propaga o err sem montar o plano', () => {
    const staffError = new InvalidFormPayloadError('form.lastName')
    vi.spyOn(ContactEmailStrategy.prototype, 'buildStaffEmail').mockReturnValueOnce(err(staffError))

    const result = strategy.buildDispatch(makeEvent(basePayload))

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBe(staffError)
  })
})
