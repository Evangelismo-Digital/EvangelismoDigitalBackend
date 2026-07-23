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
import { forgotPasswordHtmlTemplate } from '@templates/forgot-password/forgot-password-html'

/**
 * Despacho de eventos PasswordResetRequested: um único e-mail para o usuário,
 * sem cópia para a equipe. O orçamento de retry (3 × 30s fixo) cabe com folga
 * na janela de 15 min do token — nunca vale a pena tentar além dela.
 */
export class PasswordResetDispatchStrategy implements IOutboxDispatchStrategy {
  buildDispatch(event: IOutboxEvent): Result<IOutboxDispatchPlan, AppError> {
    const payload = event.payload as Partial<PasswordResetRequestedPayload>

    const nameResult = this.getStringField(payload.name, 'payload.name')
    if (isErr(nameResult)) return nameResult

    const emailResult = this.getStringField(payload.email, 'payload.email')
    if (isErr(emailResult)) return emailResult

    const tokenResult = this.getStringField(payload.token, 'payload.token')
    if (isErr(tokenResult)) return tokenResult

    const name = nameResult.value
    const email = emailResult.value
    const token = tokenResult.value

    return ok({
      emails: [
        {
          to: email,
          subject: EMAIL_CONSTANTS.PASSWORD_RECOVERY_SUBJECT,
          message: forgotPasswordTextTemplate(name, token),
          html: forgotPasswordHtmlTemplate(name, token),
          context: { type: 'password-reset', recipient: 'user' },
        },
      ],
      jobOptions: {
        attempts: PASSWORD_RESET_CONSTANTS.JOB_ATTEMPTS,
        backoff: { type: 'fixed', delay: PASSWORD_RESET_CONSTANTS.JOB_BACKOFF_DELAY_MS },
      },
    })
  }

  private getStringField(value: unknown, fieldName: string): Result<string, AppError> {
    if (typeof value === 'string' && value.length > 0) {
      return ok(value)
    }
    return err(new InvalidPasswordResetPayloadError(fieldName))
  }
}
