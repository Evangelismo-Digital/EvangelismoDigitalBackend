import { env } from '@env/index'
import { logger } from '@lib/logger'
import nodemailer, { SentMessageInfo, Transporter } from 'nodemailer'
import { MailSender, SendMailRequest } from 'core/contracts/lib/mail/mail-sender.interface'

export class NodemailerMailSender implements MailSender {
  private transporter: Transporter | null = null

  private async getTransporter(): Promise<Transporter> {
    if (this.transporter) {
      return this.transporter
    }

    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_EMAIL,
        pass: env.SMTP_PASSWORD,
      },
    })

    try {
      await transporter.verify()
    } catch (error) {
      logger.error({ error }, 'transportador SMTP falhou na verificação')
      throw error
    }

    logger.info('transportador SMTP verificado com sucesso')
    // Só armazena após a verificação: uma falha acima deixa o estado limpo e a
    // próxima chamada recria e verifica novamente o transportador.
    this.transporter = transporter
    return transporter
  }

  async send({ to, subject, message, html, attachments }: SendMailRequest): Promise<SentMessageInfo> {
    const transporter = await this.getTransporter()

    return transporter.sendMail({
      from: env.SMTP_EMAIL,
      to,
      subject,
      text: message,
      html,
      ...(attachments ? { attachments } : {}),
    })
  }
}
