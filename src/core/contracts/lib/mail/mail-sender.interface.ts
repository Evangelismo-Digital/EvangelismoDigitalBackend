import type { SentMessageInfo } from 'nodemailer'
import type { Attachment } from 'nodemailer/lib/mailer'

export interface SendMailRequest {
  to: string
  subject: string
  message: string
  html: string
  attachments?: Attachment[]
}

export interface MailSender {
  send(request: SendMailRequest): Promise<SentMessageInfo>
}
