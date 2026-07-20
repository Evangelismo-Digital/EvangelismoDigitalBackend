import { OUTBOX_EVENT_TYPES } from 'core/types/outbox/outbox-event-input'
import { FormSubmissionDispatchStrategy } from '@use-cases/forms/strategies/form-submission-dispatch-strategy'
import { PasswordResetDispatchStrategy } from '@use-cases/users/strategies/password-reset-dispatch-strategy'
import { OutboxDispatchStrategyRegistry } from './outbox-dispatch-strategy-registry'

/** Ponto único de registro das estratégias de despacho da Outbox. */
export function makeOutboxDispatchStrategyRegistry(): OutboxDispatchStrategyRegistry {
  return new OutboxDispatchStrategyRegistry([
    [OUTBOX_EVENT_TYPES.FORM_SUBMISSION_CREATED, new FormSubmissionDispatchStrategy()],
    [OUTBOX_EVENT_TYPES.PASSWORD_RESET_REQUESTED, new PasswordResetDispatchStrategy()],
  ])
}
