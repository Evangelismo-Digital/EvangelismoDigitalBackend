import { env } from '@env/index'
import { logger } from '@lib/logger'
import nodemailer, { SentMessageInfo, Transporter } from 'nodemailer'
import { MailSender, SendMailRequest } from 'core/contracts/lib/mail/mail-sender.interface'
import { EMAIL_CONSTANTS } from 'messages/constants/email/email'

export class NodemailerMailSender implements MailSender {
  private transporter: Transporter | null = null
  private consecutiveFailures = 0

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
      // Sem esses limites, o Nodemailer cai nos timeouts do SO (até ~10 min por socket)
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
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

    try {
      const info = await transporter.sendMail({
        from: env.SMTP_EMAIL,
        to,
        subject,
        text: message,
        html,
        ...(attachments ? { attachments } : {}),
      })
      this.consecutiveFailures = 0
      return info
    } catch (error) {
      this.consecutiveFailures++

      // SMTP instável: descarta o transportador em cache para que a próxima
      // chamada recrie e verifique uma conexão nova.
      if (this.consecutiveFailures >= EMAIL_CONSTANTS.SMTP_MAX_CONSECUTIVE_FAILURES) {
        logger.warn(
          { consecutiveFailures: this.consecutiveFailures },
          'Reiniciando transportador SMTP após falhas consecutivas de envio',
        )
        this.transporter = null
        this.consecutiveFailures = 0
      }

      throw error
    }
  }
}
