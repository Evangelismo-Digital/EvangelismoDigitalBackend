import {
  IOutboxDispatchPlan,
  IOutboxDispatchStrategy,
} from 'core/contracts/lib/infra/outbox-dispatch-strategy.interface'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { PasswordResetRequestedPayload } from 'core/types/outbox/outbox-event-input'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { InvalidPasswordResetPayloadError } from '@use-cases/errors/invalid-password-reset-payload-error'
import { EMAIL_CONSTANTS } from 'messages/constants/email/email'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'
import { forgotPasswordTextTemplate } from '@templates/forgot-password/forgot-password-text'
import { ForgotPasswordEmail } from '@templates/react/forgot-password'
import { render } from '@react-email/render'
import React from 'react'
import { env } from '@env/index'

/**
 * Despacho de eventos PasswordResetRequested: um único e-mail para o usuário,
 * sem cópia para a equipe. O orçamento de retry (3 × 30s fixo) cabe com folga
 * na janela de 15 min do token — nunca vale a pena tentar além dela.
 */
export class PasswordResetDispatchStrategy implements IOutboxDispatchStrategy {
  async buildDispatch(event: IOutboxEvent): Promise<Result<IOutboxDispatchPlan, AppError>> {
    const payloadResult = this.parsePayload(event.payload as Partial<PasswordResetRequestedPayload>)
    if (isErr(payloadResult)) return payloadResult

    const { name, email, token } = payloadResult.value
    const url = `${env.FRONTEND_URL}/reset-password/${token}`
    const html = await render(
      React.createElement(ForgotPasswordEmail, {
        userName: name,
        resetUrl: url,
        appName: env.APP_NAME,
        expiresInMinutes: PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES,
      }),
    )

    return ok({
      emails: [
        {
          to: email,
          subject: EMAIL_CONSTANTS.PASSWORD_RECOVERY_SUBJECT,
          message: forgotPasswordTextTemplate(name, token),
          html,
          context: { type: 'password-reset', recipient: 'user' },
        },
      ],
      jobOptions: {
        attempts: PASSWORD_RESET_CONSTANTS.JOB_ATTEMPTS,
        backoff: { type: 'fixed', delay: PASSWORD_RESET_CONSTANTS.JOB_BACKOFF_DELAY_MS },
      },
    })
  }

  private parsePayload(
    payload: Partial<PasswordResetRequestedPayload>,
  ): Result<{ name: string; email: string; token: string }, AppError> {
    const name = this.getStringField(payload.name, 'payload.name')
    if (isErr(name)) return name
    const email = this.getStringField(payload.email, 'payload.email')
    if (isErr(email)) return email
    const token = this.getStringField(payload.token, 'payload.token')
    if (isErr(token)) return token

    return ok({ name: name.value, email: email.value, token: token.value })
  }

  private getStringField(value: unknown, fieldName: string): Result<string, AppError> {
    if (typeof value === 'string' && value.length > 0) {
      return ok(value)
    }
    return err(new InvalidPasswordResetPayloadError(fieldName))
  }
}
