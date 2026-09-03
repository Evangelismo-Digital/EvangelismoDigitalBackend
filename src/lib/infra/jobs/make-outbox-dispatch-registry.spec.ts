import { describe, it, expect } from 'vitest'
import { makeOutboxDispatchStrategyRegistry } from './make-outbox-dispatch-registry'
import { OutboxDispatchStrategyRegistry } from './outbox-dispatch-strategy-registry'
import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'
import { FormSubmissionDispatchStrategy } from '@use-cases/forms/strategies/form-submission-dispatch-strategy'
import { PasswordResetDispatchStrategy } from '@use-cases/users/strategies/password-reset-dispatch-strategy'
import { isOk, isErr } from 'core/shared/result'
import { UnknownOutboxEventTypeError } from '@lib/errors/outbox/unknown-outbox-event-type-error'

describe('makeOutboxDispatchStrategyRegistry', () => {
  it('returns an OutboxDispatchStrategyRegistry instance', () => {
    expect(makeOutboxDispatchStrategyRegistry()).toBeInstanceOf(OutboxDispatchStrategyRegistry)
  })

  it('registers the form-submission strategy under FORM_SUBMISSION_CREATED', () => {
    const result = makeOutboxDispatchStrategyRegistry().resolve(OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBeInstanceOf(FormSubmissionDispatchStrategy)
  })

  it('registers the password-reset strategy under PASSWORD_RESET_REQUESTED', () => {
    const result = makeOutboxDispatchStrategyRegistry().resolve(OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) expect(result.value).toBeInstanceOf(PasswordResetDispatchStrategy)
  })

  it('does not resolve an unregistered event type', () => {
    const result = makeOutboxDispatchStrategyRegistry().resolve('SomethingElse')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) expect(result.error).toBeInstanceOf(UnknownOutboxEventTypeError)
  })

  it('builds an independent registry on each call', () => {
    expect(makeOutboxDispatchStrategyRegistry()).not.toBe(makeOutboxDispatchStrategyRegistry())
  })
})
