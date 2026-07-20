import { describe, it, expect } from 'vitest'
import { PasswordResetDispatchStrategy } from './password-reset-dispatch-strategy'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'
import { isOk, isErr } from 'core/shared/result'
import { InvalidPasswordResetPayloadError } from '@use-cases/errors/invalid-password-reset-payload-error'
import { EMAIL_CONSTANTS } from 'messages/constants/email/email'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'

const expiresAt = new Date(Date.now() + 15 * 60 * 1000)

function makeEvent(payload: Record<string, unknown>): IOutboxEvent {
  return {
    id: 1,
    publicId: 'evt-1',
    type: 'PasswordResetRequested',
    status: IOutboxEventStatus.PENDING,
    payload,
    attempts: 0,
    occurredAt: new Date(),
    sendingAt: undefined,
    expiresAt,
  }
}

const basePayload = {
  userPublicId: 'user-1',
  name: 'João',
  email: 'joao@test.com',
  token: 'token-cru-abc123',
  tokenExpiresAt: expiresAt.toISOString(),
}

describe('PasswordResetDispatchStrategy', () => {
  const strategy = new PasswordResetDispatchStrategy()

  it('monta um único e-mail para o usuário, sem cópia para a equipe', () => {
    const result = strategy.buildDispatch(makeEvent(basePayload))

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    expect(result.value.emails).toHaveLength(1)
    const [email] = result.value.emails
    expect(email.to).toBe('joao@test.com')
    expect(email.subject).toBe(EMAIL_CONSTANTS.PASSWORD_RECOVERY_SUBJECT)
    expect(email.context).toEqual({ type: 'password-reset', recipient: 'user' })
  })

  it('o link do e-mail carrega o token cru do payload', () => {
    const result = strategy.buildDispatch(makeEvent(basePayload))

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    const [email] = result.value.emails
    expect(email.message).toContain('token-cru-abc123')
    expect(email.html).toContain('token-cru-abc123')
  })

  it('define jobOptions com orçamento de retry dentro da janela do token (3 × 30s fixo)', () => {
    const result = strategy.buildDispatch(makeEvent(basePayload))

    expect(isOk(result)).toBe(true)
    if (!isOk(result)) return

    expect(result.value.jobOptions).toEqual({
      attempts: PASSWORD_RESET_CONSTANTS.JOB_ATTEMPTS,
      backoff: { type: 'fixed', delay: PASSWORD_RESET_CONSTANTS.JOB_BACKOFF_DELAY_MS },
    })
  })

  it.each(['name', 'email', 'token'] as const)(
    'campo obrigatório ausente (%s): retorna err(InvalidPasswordResetPayloadError)',
    (field) => {
      const payload: Record<string, unknown> = { ...basePayload }
      delete payload[field]

      const result = strategy.buildDispatch(makeEvent(payload))

      expect(isErr(result)).toBe(true)
      if (!isErr(result)) return
      expect(result.error).toBeInstanceOf(InvalidPasswordResetPayloadError)
      expect(result.error.body.message).toContain(`payload.${field}`)
    },
  )

  it('campo com tipo errado (token numérico): retorna err', () => {
    const result = strategy.buildDispatch(makeEvent({ ...basePayload, token: 12345 }))

    expect(isErr(result)).toBe(true)
  })

  it('campo string vazia: retorna err', () => {
    const result = strategy.buildDispatch(makeEvent({ ...basePayload, email: '' }))

    expect(isErr(result)).toBe(true)
  })
})
