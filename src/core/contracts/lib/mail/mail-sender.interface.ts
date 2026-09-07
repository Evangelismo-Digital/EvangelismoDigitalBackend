import type SMTPTransport from 'nodemailer/lib/smtp-transport'

/**
 * The result of a send, typed concretely.
 *
 * `nodemailer`'s top-level `SentMessageInfo` export is `export type
 * SentMessageInfo = any`, so using it turned every caller's `info` into `any`
 * and disabled type checking from here outwards. The SMTP transport — the only
 * one this application creates — declares a real interface with `messageId`,
 * `accepted`, `rejected` and `response`, which is what the mail worker reads.
 */
export type SentMessageInfo = SMTPTransport.SentMessageInfo
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
