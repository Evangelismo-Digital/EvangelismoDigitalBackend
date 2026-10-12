import type SMTPPool from 'nodemailer/lib/smtp-pool'

/**
 * The result of a send, typed concretely.
 *
 * `nodemailer`'s top-level `SentMessageInfo` export is `export type
 * SentMessageInfo = any`, so using it turned every caller's `info` into `any`
 * and disabled type checking from here outwards. The transport this
 * application creates declares a real interface with `messageId`, `accepted`,
 * `rejected` and `response`, which is what the mail worker reads.
 *
 * Pooled variant since the sender enabled `pool: true`: the two differ only in
 * the smtp-transport-only `pending` field, which nothing here reads, and naming
 * the transport actually in use keeps the type honest rather than structurally
 * close enough.
 */
export type SentMessageInfo = SMTPPool.SentMessageInfo
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
