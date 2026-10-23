/**
 * O breaker do SMTP (A4 do plano de reúso de dependências).
 *
 * Substitui o contador de falhas consecutivas que vivia no sender: aquele
 * nunca recusava um envio, apenas descartava o transportador. O breaker falha
 * RÁPIDO enquanto o SMTP está fora — em vez de gastar o timeout de socket por
 * mensagem — e a abertura do circuito descarta o transportador, cujas conexões
 * do pool provavelmente morreram junto.
 *
 * Nada se perde com o circuito aberto: a falha sobe para o mail-worker, que a
 * converte em retentativa do BullMQ, e o evento continua no outbox.
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'

// As fábricas de `vi.mock` são içadas acima de tudo, então o objeto que elas
// capturam precisa ser içado junto.
const { envMock } = vi.hoisted(() => ({
  envMock: {
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 465,
    SMTP_SECURE: true,
    SMTP_EMAIL: 'remetente@example.com',
    SMTP_PASSWORD: 'senha',
    SMTP_POOL_MAX_CONNECTIONS: 3,
    SMTP_POOL_MAX_MESSAGES: 100,
    SMTP_POOL_RATE_DELTA_MS: 1_000,
    SMTP_POOL_RATE_LIMIT: 5,
    SMTP_CONNECTION_TIMEOUT_MS: 5_000,
    SMTP_GREETING_TIMEOUT_MS: 5_000,
    SMTP_SOCKET_TIMEOUT_MS: 10_000,
    SMTP_CIRCUIT_BREAKER_ENABLED: true,
    SMTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD: 0.5,
    // Janela curta com piso de vazão 1: duas falhas bastam para abrir, em vez
    // das muitas que a configuração de produção exige de propósito.
    SMTP_CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: 1_000,
    SMTP_CIRCUIT_BREAKER_MIN_THROUGHPUT: 1,
    SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: 10_000,
  },
}))

vi.mock('@config/env/index', () => ({ env: envMock }))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn() } }))

import nodemailer from 'nodemailer'
import { NodemailerMailSender } from './nodemailer-mail-sender'
import { logger } from '@infra/logger'
import { EMAIL_LOGS } from '@common/messages/constants/email/email'
import { BrokenCircuitError, CircuitState } from 'cockatiel'

const createTransport = nodemailer.createTransport as unknown as Mock

function makeTransporterMock() {
  return {
    verify: vi.fn().mockResolvedValue(true),
    sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-id' }),
  }
}

const request = {
  to: 'dest@example.com',
  subject: 'Assunto',
  message: 'mensagem',
  html: '<p>mensagem</p>',
}

/** Falha `count` envios, engolindo os erros — só o estado interessa aqui. */
async function failSends(sender: NodemailerMailSender, count: number) {
  for (let i = 0; i < count; i++) {
    await sender.send(request).catch(() => undefined)
  }
}

describe('NodemailerMailSender — breaker do SMTP', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    envMock.SMTP_CIRCUIT_BREAKER_ENABLED = true
  })

  it('começa com o circuito fechado', () => {
    expect(new NodemailerMailSender().circuitState).toBe(CircuitState.Closed)
  })

  it('não abre o circuito enquanto os envios têm sucesso', async () => {
    const transporter = makeTransporterMock()
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await sender.send(request)
    await sender.send(request)
    await sender.send(request)

    expect(sender.circuitState).toBe(CircuitState.Closed)
    expect(transporter.sendMail).toHaveBeenCalledTimes(3)
  })

  it('abre o circuito depois de uma sequência de falhas de envio', async () => {
    const transporter = makeTransporterMock()
    transporter.sendMail.mockRejectedValue(new Error('SMTP fora do ar'))
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await failSends(sender, 4)

    expect(sender.circuitState).toBe(CircuitState.Open)
  })

  /**
   * O ponto do breaker: com o circuito aberto o envio nem chega ao SMTP. Era
   * isso que o contador de falhas não fazia — ele deixava toda mensagem pagar o
   * timeout de socket de um servidor que já se sabia fora.
   */
  it('com o circuito aberto, falha rápido sem chamar o SMTP', async () => {
    const transporter = makeTransporterMock()
    transporter.sendMail.mockRejectedValue(new Error('SMTP fora do ar'))
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await failSends(sender, 4)
    expect(sender.circuitState).toBe(CircuitState.Open)

    const callsBefore = transporter.sendMail.mock.calls.length
    await expect(sender.send(request)).rejects.toBeInstanceOf(BrokenCircuitError)

    expect(transporter.sendMail).toHaveBeenCalledTimes(callsBefore)
  })

  /**
   * As conexões do pool de um SMTP que acabou de falhar em série não merecem
   * confiança — por isso a abertura descarta o transportador, e a próxima
   * tentativa reconecta do zero. É a metade "reconectar" do comportamento
   * antigo, preservada deliberadamente ao lado do falhar-rápido.
   */
  it('descarta o transportador em cache quando o circuito abre, e avisa no log', async () => {
    const flapping = makeTransporterMock()
    flapping.sendMail.mockRejectedValue(new Error('SMTP instável'))
    createTransport.mockReturnValue(flapping)

    const sender = new NodemailerMailSender()
    await failSends(sender, 4)

    expect(logger.warn).toHaveBeenCalledWith(EMAIL_LOGS.SMTP_CIRCUIT_OPENED)

    // Em meio-aberto o envio volta a passar e precisa de um transportador novo.
    const healthy = makeTransporterMock()
    createTransport.mockReturnValue(healthy)
    const createdBefore = createTransport.mock.calls.length

    // Os timers falsos têm de continuar ativos durante o envio: o breaker lê o
    // relógio ao decidir se já pode ir para meio-aberto, e restaurar o relógio
    // real antes da chamada devolveria o circuito ao estado aberto.
    vi.useFakeTimers()
    try {
      await vi.advanceTimersByTimeAsync(envMock.SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS + 1_000)

      await expect(sender.send(request)).resolves.toEqual({ messageId: 'mock-id' })
    } finally {
      vi.useRealTimers()
    }

    expect(createTransport.mock.calls.length).toBeGreaterThan(createdBefore)
    expect(healthy.verify).toHaveBeenCalled()
  })

  /**
   * Os dois logs do transporte são contrato de diagnóstico, não enfeite: é por
   * eles que se distingue um SMTP que não AUTENTICA de um que não ENTREGA, na
   * única ocasião em que alguém vai ler isso — durante o incidente.
   */
  it('loga a falha de verificação COM o erro que a causou', async () => {
    const transporter = makeTransporterMock()
    const authError = new Error('535 Authentication failed')
    transporter.verify.mockRejectedValue(authError)
    createTransport.mockReturnValue(transporter)

    await expect(new NodemailerMailSender().send(request)).rejects.toThrow(authError)

    expect(logger.error).toHaveBeenCalledWith({ error: authError }, EMAIL_LOGS.SMTP_VERIFY_FAILED)
  })

  it('loga a verificação bem-sucedida do transporte', async () => {
    createTransport.mockReturnValue(makeTransporterMock())

    await new NodemailerMailSender().send(request)

    expect(logger.info).toHaveBeenCalledWith(EMAIL_LOGS.SMTP_VERIFIED)
  })

  /**
   * CONTRAPESO. Todos os testes acima continuariam passando se o sender
   * simplesmente recusasse tudo. Este fixa que, desligado, o breaker sai do
   * caminho: a política é COMPOSTA sem ele, e o envio chega ao SMTP mesmo
   * depois de uma série de falhas.
   */
  it('com o breaker desligado, os envios continuam chegando ao SMTP após falhas', async () => {
    envMock.SMTP_CIRCUIT_BREAKER_ENABLED = false

    const transporter = makeTransporterMock()
    transporter.sendMail.mockRejectedValue(new Error('SMTP fora do ar'))
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    expect(sender.circuitState).toBeNull()

    await failSends(sender, 5)

    // Sem breaker, a 6ª tentativa ainda é feita de verdade.
    await expect(sender.send(request)).rejects.toThrow('SMTP fora do ar')
    expect(transporter.sendMail).toHaveBeenCalledTimes(6)
  })

  it('com o breaker desligado, a falha original chega ao chamador (não um BrokenCircuitError)', async () => {
    envMock.SMTP_CIRCUIT_BREAKER_ENABLED = false

    const transporter = makeTransporterMock()
    const smtpError = new Error('452 4.2.2 Mailbox full')
    transporter.sendMail.mockRejectedValue(smtpError)
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await failSends(sender, 4)

    await expect(sender.send(request)).rejects.toBe(smtpError)
  })

  /**
   * A verificação do transportador fica DENTRO do escopo do breaker de
   * propósito: um SMTP que não autentica está tão indisponível quanto um que
   * não entrega, e tem de contar para a taxa de falha.
   */
  it('conta falhas de verificação do transportador para abrir o circuito', async () => {
    const transporter = makeTransporterMock()
    transporter.verify.mockRejectedValue(new Error('535 Authentication failed'))
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await failSends(sender, 4)

    expect(sender.circuitState).toBe(CircuitState.Open)
    expect(transporter.sendMail).not.toHaveBeenCalled()
  })
})
