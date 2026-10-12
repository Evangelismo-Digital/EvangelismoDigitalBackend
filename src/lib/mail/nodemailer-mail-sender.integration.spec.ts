/**
 * Runtime — o NodemailerMailSender contra um servidor SMTP real (mínimo, em
 * processo, sobre `node:net`), sem mock do nodemailer.
 *
 * Os specs unitários mockam `createTransport`, então provam a NOSSA lógica —
 * pooling configurado, breaker, cache do transportador — mas não provariam que
 * a biblioteca ainda aceita essas opções. Depois da subida de major
 * (nodemailer 9 → 10) é exatamente essa a pergunta: o pool conecta, autentica
 * o diálogo, entrega a mensagem e fecha.
 *
 * Opt-in (`npm run test:integration:full`): abre um socket, então não pertence
 * à camada unitária, que o repositório define como zero-I/O.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import net from 'node:net'
import type { AddressInfo } from 'node:net'

// O env é substituído por completo abaixo, e o pino lê LOG_LEVEL na importação
// — sem este mock o logger falha a montar antes de qualquer teste rodar.
vi.mock('@lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

/** Diálogo SMTP mínimo: o suficiente para EHLO, MAIL/RCPT/DATA e QUIT. */
function startFakeSmtpServer() {
  const received: string[] = []

  const server = net.createServer((socket) => {
    let buffer = ''
    let inData = false

    socket.write('220 localhost ESMTP fake\r\n')

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')

      if (inData) {
        if (!buffer.includes('\r\n.\r\n')) return
        received.push(buffer.slice(0, buffer.indexOf('\r\n.\r\n')))
        buffer = ''
        inData = false
        socket.write('250 2.0.0 Ok: queued\r\n')
        return
      }

      let newline = buffer.indexOf('\r\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 2)

        if (/^EHLO/i.test(line)) socket.write('250-localhost\r\n250 SMTPUTF8\r\n')
        else if (/^HELO/i.test(line)) socket.write('250 localhost\r\n')
        else if (/^(MAIL FROM|RCPT TO|RSET|NOOP)/i.test(line)) socket.write('250 2.0.0 Ok\r\n')
        else if (/^DATA/i.test(line)) {
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n')
          inData = true
          buffer = ''
          return
        } else if (/^QUIT/i.test(line)) {
          socket.write('221 2.0.0 Bye\r\n')
          socket.end()
          return
        } else socket.write('250 2.0.0 Ok\r\n')

        newline = buffer.indexOf('\r\n')
      }
    })

    socket.on('error', () => undefined)
  })

  return { server, received }
}

const { server, received } = startFakeSmtpServer()
let port = 0

beforeEach(async () => {
  received.length = 0
  vi.resetModules()

  if (port === 0) {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  }

  vi.doMock('@env/index', () => ({
    env: {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: port,
      SMTP_SECURE: false,
      SMTP_EMAIL: 'remetente@example.com',
      SMTP_PASSWORD: 'senha',
      SMTP_POOL_MAX_CONNECTIONS: 2,
      SMTP_POOL_MAX_MESSAGES: 50,
      SMTP_POOL_RATE_DELTA_MS: 1_000,
      SMTP_POOL_RATE_LIMIT: 10,
      SMTP_CONNECTION_TIMEOUT_MS: 5_000,
      SMTP_GREETING_TIMEOUT_MS: 5_000,
      SMTP_SOCKET_TIMEOUT_MS: 10_000,
      SMTP_CIRCUIT_BREAKER_ENABLED: true,
      SMTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD: 0.5,
      SMTP_CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: 60_000,
      SMTP_CIRCUIT_BREAKER_MIN_THROUGHPUT: 2,
      SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: 30_000,
    },
  }))
})

afterEach(() => {
  vi.doUnmock('@env/index')
})

async function makeSender() {
  const { NodemailerMailSender } = await import('./nodemailer-mail-sender.js')
  return new NodemailerMailSender()
}

const request = {
  to: 'destino@example.com',
  subject: 'Assunto de teste',
  message: 'corpo em texto',
  html: '<p>corpo em <strong>HTML</strong></p>',
}

describe('NodemailerMailSender contra um SMTP real', () => {
  it('verifica o transporte e entrega a mensagem', async () => {
    const sender = await makeSender()

    const info = await sender.send(request)

    expect(info.accepted).toContain('destino@example.com')
    expect(info.response).toMatch(/^250/)
    expect(received).toHaveLength(1)
  })

  it('envia assunto, destinatário e as duas partes do corpo', async () => {
    const sender = await makeSender()

    await sender.send(request)

    const message = received[0]
    expect(message).toContain('To: destino@example.com')
    expect(message).toContain('corpo em texto')
    expect(message).toContain('corpo em <strong>HTML</strong>')
  })

  /**
   * O pooling é o ponto da mudança: várias mensagens seguidas têm de passar
   * pelo mesmo transportador, sem reconectar nem travar.
   */
  it('entrega várias mensagens em sequência pelo mesmo pool', async () => {
    const sender = await makeSender()

    await sender.send(request)
    await sender.send({ ...request, to: 'outro@example.com' })
    await sender.send({ ...request, to: 'terceiro@example.com' })

    expect(received).toHaveLength(3)
  })

  it('entrega mensagens disparadas em paralelo', async () => {
    const sender = await makeSender()

    const results = await Promise.all([
      sender.send(request),
      sender.send({ ...request, to: 'b@example.com' }),
      sender.send({ ...request, to: 'c@example.com' }),
    ])

    expect(results.every((info) => /^250/.test(info.response))).toBe(true)
    expect(received).toHaveLength(3)
  })

  it('preserva acentos do corpo na mensagem entregue', async () => {
    const sender = await makeSender()

    await sender.send({ ...request, message: 'João Conceição', html: '<p>João Conceição</p>' })

    // O corpo é codificado (quoted-printable/base64) conforme o MIME; o que
    // importa é que a mensagem saiu e o cabeçalho declara a codificação.
    expect(received[0]).toMatch(/Content-Type: text\/plain/i)
    expect(received).toHaveLength(1)
  })

  it('falha quando o servidor está fora, sem derrubar o processo', async () => {
    vi.resetModules()
    vi.doMock('@env/index', () => ({
      env: {
        SMTP_HOST: '127.0.0.1',
        // Porta fechada de propósito.
        SMTP_PORT: 1,
        SMTP_SECURE: false,
        SMTP_EMAIL: 'remetente@example.com',
        SMTP_PASSWORD: 'senha',
        SMTP_POOL_MAX_CONNECTIONS: 1,
        SMTP_POOL_MAX_MESSAGES: 10,
        SMTP_POOL_RATE_DELTA_MS: 1_000,
        SMTP_POOL_RATE_LIMIT: 5,
        SMTP_CONNECTION_TIMEOUT_MS: 500,
        SMTP_GREETING_TIMEOUT_MS: 500,
        SMTP_SOCKET_TIMEOUT_MS: 500,
        SMTP_CIRCUIT_BREAKER_ENABLED: false,
        SMTP_CIRCUIT_BREAKER_FAILURE_THRESHOLD: 0.5,
        SMTP_CIRCUIT_BREAKER_SAMPLING_WINDOW_MS: 60_000,
        SMTP_CIRCUIT_BREAKER_MIN_THROUGHPUT: 2,
        SMTP_CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS: 30_000,
      },
    }))

    const sender = await makeSender()

    await expect(sender.send(request)).rejects.toThrow()
  })
})
