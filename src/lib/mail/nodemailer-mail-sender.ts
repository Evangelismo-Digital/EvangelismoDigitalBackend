import { env } from '@env/index'
import { logger } from '@lib/logger'
import nodemailer, { Transporter } from 'nodemailer'
import { circuitBreaker, handleAll, SamplingBreaker, CircuitBreakerPolicy, CircuitState } from 'cockatiel'
import type { SentMessageInfo } from 'core/contracts/lib/mail/mail-sender.interface'
import { MailSender, SendMailRequest } from 'core/contracts/lib/mail/mail-sender.interface'
import { EMAIL_LOGS } from 'messages/constants/email/email'

/**
 * Envio SMTP com pooling do nodemailer e um breaker do cockatiel.
 *
 * O contador de falhas consecutivas que havia aqui não era um breaker: ele
 * nunca recusava um envio, só descartava o transportador em cache depois de N
 * falhas. As duas coisas resolvem problemas diferentes e agora ambas existem —
 * o breaker falha rápido enquanto o SMTP está fora (em vez de gastar o timeout
 * de socket por mensagem), e a abertura do circuito descarta o transportador,
 * cujas conexões do pool provavelmente estão mortas junto com ele.
 *
 * Nada se perde quando o circuito está aberto: a falha sobe para o mail-worker,
 * que a traduz em retentativa do BullMQ, e o evento continua no outbox.
 */
export class NodemailerMailSender implements MailSender {
  private transporter: Transporter<SentMessageInfo> | null = null
  private readonly breaker = createSmtpBreaker()

  constructor() {
    this.breaker?.onBreak(() => {
      // Conexões do pool de um SMTP que acabou de falhar em série não merecem
      // confiança; a próxima tentativa (meio-aberta) reconecta do zero.
      logger.warn(EMAIL_LOGS.SMTP_CIRCUIT_OPENED)
      this.transporter = null
    })
  }

  private async getTransporter(): Promise<Transporter<SentMessageInfo>> {
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
      // Pooling: o worker manda em lote, e abrir uma conexão por mensagem é o
      // que torna um lote lento o bastante para estourar o lock do job. Os
      // limites vêm do env porque são cota do provedor, não constante de código.
      pool: true,
      maxConnections: env.SMTP_POOL_MAX_CONNECTIONS,
      maxMessages: env.SMTP_POOL_MAX_MESSAGES,
      rateDelta: env.SMTP_POOL_RATE_DELTA_MS,
      rateLimit: env.SMTP_POOL_RATE_LIMIT,
      // Sem esses limites, o Nodemailer cai nos timeouts do SO (até ~10 min por socket)
      connectionTimeout: env.SMTP_CONNECTION_TIMEOUT_MS,
      greetingTimeout: env.SMTP_GREETING_TIMEOUT_MS,
      socketTimeout: env.SMTP_SOCKET_TIMEOUT_MS,
    })

    await verifyTransporter(transporter)

    // Só armazena após a verificação: uma falha acima deixa o estado limpo e a
    // próxima chamada recria e verifica novamente o transportador.
    this.transporter = transporter
    return transporter
  }

  async send(request: SendMailRequest): Promise<SentMessageInfo> {
    if (!this.breaker) {
      return this.dispatch(request)
    }

    return this.breaker.execute(() => this.dispatch(request))
  }

  /**
   * Um envio, sem política. A verificação do transportador entra no escopo do
   * breaker de propósito: um SMTP que não autentica falha aqui exatamente como
   * um que não entrega, e é a mesma indisponibilidade.
   */
  private async dispatch({ to, subject, message, html, attachments }: SendMailRequest): Promise<SentMessageInfo> {
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

  /** Estado atual do circuito — exposto para teste e diagnóstico. */
  get circuitState(): CircuitState | null {
    return this.breaker?.state ?? null
  }
}

/** Verificação do transporte, com o log que distingue "não autentica" de "não entrega". */
async function verifyTransporter(transporter: Transporter<SentMessageInfo>): Promise<void> {
  try {
    await transporter.verify()
  } catch (error) {
    logger.error({ error }, EMAIL_LOGS.SMTP_VERIFY_FAILED)
    throw error
  }

  logger.info(EMAIL_LOGS.SMTP_VERIFIED)
}

/**
 * Um breaker de amostragem, como o dos provedores: "três falhas seguidas"
 * abriria por ruído onde uma TAXA de falha não abre. `minimumRps` é baixo
 * porque o envio é esporádico — o valor dos provedores nunca seria atingido
 * aqui, e o breaker jamais abriria.
 *
 * Desligado significa compor sem breaker, não consultar flag por chamada.
 */
function createSmtpBreaker(): CircuitBreakerPolicy | null {
  if (!env.SMTP_CIRCUIT_BREAKER_ENABLED) {
    return null
  }

  return circuitBreaker(handleAll, {
    halfOpenAfter: env.SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
    breaker: new SamplingBreaker({
      threshold: env.SMTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      duration: env.SMTP_CIRCUIT_BREAKER_SAMPLING_WINDOW_MS,
      minimumRps: env.SMTP_CIRCUIT_BREAKER_MIN_THROUGHPUT,
    }),
  })
}
