import { sendEmail } from '@utils/send-email'
import { Attachment } from 'nodemailer/lib/mailer'
import { SentMessageInfo } from 'nodemailer'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'

interface SendEmailUseCaseRequest {
  to: string
  subject: string
  message: string
  html: string
  attachments?: Attachment[]
}

export class SendEmailUseCase {
  async execute({
    to,
    subject,
    message,
    html,
    attachments,
  }: SendEmailUseCaseRequest): Promise<Result<SentMessageInfo, AppError>> {
    try {
      const info = await sendEmail({ to, subject, message, html, attachments })
      return ok(info)
    } catch (error) {
      return err(new SmtpDispatchError(error))
    }
  }
}
