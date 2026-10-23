import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FormSubmissionDispatchStrategy } from './form-submission-dispatch.strategy'
import { ContactEmailStrategy } from './contact-email.strategy'
import { DecisionForChristEmailStrategy } from './decision-for-christ-email.strategy'
import { IOutboxEvent, IOutboxEventStatus } from '@infra/outbox/repositories/outbox-repository.interface'
import { isOk, isErr, err } from '@common/utils/result'
import { InvalidFormPayloadError } from '@modules/forms/errors/invalid-form-payload-error'

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

describe('FormSubmissionDispatchStrategy', async () => {
  let strategy: FormSubmissionDispatchStrategy

  beforeEach(() => {
    vi.restoreAllMocks()
    strategy = new FormSubmissionDispatchStrategy()
  })

  it('async monta dois e-mails (usuário + equipe) sem jobOptions (defaults da fila)', async () => {
    const result = await strategy.buildDispatch(makeEvent(basePayload))

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return
    expect(result.value.emails).toHaveLength(2)
    expect(result.value.emails[0].to).toBe('joao@test.com')
    expect(result.value.jobOptions).toBeUndefined()
  })

  it('async roteia decisaoPorCristo=true para DecisionForChristEmailStrategy', async () => {
    const decisionSpy = vi.spyOn(DecisionForChristEmailStrategy.prototype, 'buildUserEmail')
    const contactSpy = vi.spyOn(ContactEmailStrategy.prototype, 'buildUserEmail')

    await strategy.buildDispatch(makeEvent({ ...basePayload, decisaoPorCristo: true }))

    expect(decisionSpy).toHaveBeenCalledOnce()
    expect(contactSpy).not.toHaveBeenCalled()
  })

  it('async roteia decisaoPorCristo=false para ContactEmailStrategy', async () => {
    const decisionSpy = vi.spyOn(DecisionForChristEmailStrategy.prototype, 'buildUserEmail')
    const contactSpy = vi.spyOn(ContactEmailStrategy.prototype, 'buildUserEmail')

    await strategy.buildDispatch(makeEvent(basePayload))

    expect(contactSpy).toHaveBeenCalledOnce()
    expect(decisionSpy).not.toHaveBeenCalled()
  })

  it('async payload inválido (email ausente): propaga err(InvalidFormPayloadError)', async () => {
    const result = await strategy.buildDispatch(makeEvent({ name: 'João', decisaoPorCristo: false }))

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBeInstanceOf(InvalidFormPayloadError)
  })

  it('async falha no e-mail da equipe: propaga o err sem montar o plano', async () => {
    const staffError = new InvalidFormPayloadError('form.lastName')
    vi.spyOn(ContactEmailStrategy.prototype, 'buildStaffEmail').mockResolvedValueOnce(err(staffError))

    const result = await strategy.buildDispatch(makeEvent(basePayload))

    expect(isErr(result)).toBe(true)
    if (!isErr(result)) return
    expect(result.error).toBe(staffError)
  })
})
