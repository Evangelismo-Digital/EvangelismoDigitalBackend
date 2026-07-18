import { SendEmailUseCase } from '@use-cases/email/send-email'
import { NodemailerMailSender } from '@lib/mail/nodemailer-mail-sender'

// Instância única por processo: o transportador SMTP interno é criado de forma
// preguiçosa e reutilizado entre jobs do mail-worker (que chama esta factory a
// cada job).
const mailSender = new NodemailerMailSender()

export function makeSendEmailUseCase() {
  return new SendEmailUseCase(mailSender)
}
