import { Attachment } from 'nodemailer/lib/mailer'
import { SentMessageInfo } from 'nodemailer'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'
import { MailSender } from 'core/contracts/lib/mail/mail-sender.interface'

interface SendEmailUseCaseRequest {
  to: string
  subject: string
  message: string
  html: string
  attachments?: Attachment[]
}

export class SendEmailUseCase {
  constructor(private readonly mailSender: MailSender) {}

  async execute({
    to,
    subject,
    message,
    html,
    attachments,
  }: SendEmailUseCaseRequest): Promise<Result<SentMessageInfo, AppError>> {
    try {
      const info = await this.mailSender.send({ to, subject, message, html, attachments })
      return ok(info)
    } catch (error) {
      return err(new SmtpDispatchError(error))
    }
  }
}
