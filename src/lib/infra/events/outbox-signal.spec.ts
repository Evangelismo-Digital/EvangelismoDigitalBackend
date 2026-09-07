import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

vi.mock('@env/index', () => ({
  env: { REDIS_HOST: 'localhost', REDIS_PORT: 6379, REDIS_PASSWORD: '' },
}))

vi.mock('@lib/logger', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
  return { logger }
})

const mockCaptureError = vi.fn()

vi.mock('@lib/sentry/capture', () => ({
  captureError: (...args: unknown[]) => mockCaptureError(...args),
}))

type Handler = (...args: unknown[]) => void

let nextPublishError: Error | null = null
let nextSubscribeError: Error | null = null

class FakeRedis {
  status: 'wait' | 'ready' | 'close' | 'end' = 'wait'
  handlers: Record<string, Handler[]> = {}

  on(event: string, cb: Handler) {
    ;(this.handlers[event] ??= []).push(cb)
    return this
  }

  off(event: string, cb: Handler) {
    this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== cb)
    return this
  }

  emit(event: string, ...args: unknown[]) {
    ;(this.handlers[event] ?? []).forEach((h) => h(...args))
  }

  connect = vi.fn(async () => {
    this.status = 'ready'
  })

  publish = vi.fn(async () => {
    if (nextPublishError) {
      const error = nextPublishError
      nextPublishError = null
      throw error
    }
    return 1
  })

  subscribe = vi.fn(async () => {
    if (nextSubscribeError) {
      const error = nextSubscribeError
      nextSubscribeError = null
      throw error
    }
    return 1
  })

  quit = vi.fn(async () => {
    this.status = 'end'
    return 'OK'
  })
}

const instances: FakeRedis[] = []

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(function FakeRedisConstructor() {
    const instance = new FakeRedis()
    instances.push(instance)
    return instance
  }),
}))

import { OutboxSignal } from './outbox-signal'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { logger } from '@lib/logger'

describe('OutboxSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    instances.length = 0
    nextPublishError = null
    nextSubscribeError = null
  })

  afterEach(async () => {
    await OutboxSignal.disconnect()
  })

  describe('publishNewItem', () => {
    it('publica a mensagem com sucesso, sem captura no Sentry', async () => {
      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)

      const publisher = instances[0]
      expect(publisher.publish).toHaveBeenCalledWith(
        REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL,
        JSON.stringify({ publicId: 'evt-1', event: { publicId: 'evt-1' } }),
      )
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('falha ao publicar (fire-and-forget): loga warn e NÃO captura no Sentry (cron é o fallback documentado)', async () => {
      const publishError = new Error('conexão recusada')
      nextPublishError = publishError

      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)

      expect(logger.warn).toHaveBeenCalledWith({ err: publishError }, OUTBOX_LOGS.SIGNAL_PUBLISH_FAILED)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })
  })

  describe('subscribe', () => {
    it('inscreve-se com sucesso e processa uma mensagem válida', async () => {
      const onSignal = vi.fn().mockResolvedValue(undefined)
      const event = { publicId: 'evt-1', type: 'FormSubmissionCreated' }

      await OutboxSignal.subscribe(onSignal)

      const subscriber = instances[0]
      subscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId: 'evt-1', event }))
      await Promise.resolve()

      expect(onSignal).toHaveBeenCalledWith('evt-1', event)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('payload sem o campo `event`: não chama onSignal e não captura no Sentry', async () => {
      // The callback's signature promises an IOutboxEvent. A payload missing it
      // used to be dispatched anyway, handing `undefined` to a processor that
      // immediately dereferences it — a message from an older deploy, or from
      // anything else publishing on this channel, would crash the worker.
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      const subscriber = instances[0]
      subscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId: 'evt-1' }))
      await Promise.resolve()

      expect(onSignal).not.toHaveBeenCalled()
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('payload sem `publicId`: não chama onSignal', async () => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      const subscriber = instances[0]
      subscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ event: { id: 1 } }))
      await Promise.resolve()

      expect(onSignal).not.toHaveBeenCalled()
    })

    // Valid JSON that is not an object at all. Each of these takes a different
    // branch of the payload guard, and without them a mutant that drops the
    // `typeof`/`null` checks — or inverts the `||` between them — survives.
    it.each([
      ['uma string', JSON.stringify('apenas uma string')],
      ['um número', JSON.stringify(42)],
      ['null', JSON.stringify(null)],
      ['um array', JSON.stringify(['evt-1'])],
      // `typeof null === 'object'`, so this one gets past the first check and is
      // caught only by the explicit null test on `event`.
      ['um objeto com event null', JSON.stringify({ publicId: 'evt-1', event: null })],
    ])('payload que é %s e não um objeto de sinal: não chama onSignal', async (_label, rawMessage) => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      const subscriber = instances[0]
      subscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, rawMessage)
      // `setImmediate`, not a bare `await Promise.resolve()`: the assertion on
      // captureError depends on the handler's catch block having run, and one
      // microtask tick is not a guarantee of that under a loaded event loop —
      // which is exactly the condition Stryker runs its workers in.
      await new Promise((resolve) => setImmediate(resolve))

      expect(onSignal).not.toHaveBeenCalled()
      expect(mockCaptureError).not.toHaveBeenCalled()
      // The rejected message itself must reach the log, or an operator has no
      // way to tell WHICH payload was dropped.
      expect(logger.warn).toHaveBeenCalledWith({ message: rawMessage }, OUTBOX_LOGS.UNEXPECTED_CHANNEL)
    })

    it('falha ao se inscrever (client.subscribe rejeita): loga SUBSCRIBE_ERROR e captura no Sentry', async () => {
      const subscribeError = new Error('falha ao inscrever')
      nextSubscribeError = subscribeError

      await OutboxSignal.subscribe(vi.fn())

      expect(logger.error).toHaveBeenCalledWith({ err: subscribeError }, OUTBOX_LOGS.SUBSCRIBE_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(subscribeError)
    })

    it('mensagem recebida em canal inesperado: warn, sem chamar onSignal, sem captura', async () => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      const subscriber = instances[0]
      subscriber.emit('message', 'canal-errado', 'qualquer coisa')
      await Promise.resolve()

      expect(onSignal).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith({ channel: 'canal-errado' }, OUTBOX_LOGS.UNEXPECTED_CHANNEL)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('mensagem malformada (JSON inválido): loga SIGNAL_PROCESSING_ERROR e captura no Sentry', async () => {
      await OutboxSignal.subscribe(vi.fn())

      const subscriber = instances[0]
      subscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, 'não é json{')
      await Promise.resolve()

      expect(logger.error).toHaveBeenCalledWith(
        { err: expect.any(Error), publicId: 'não é json{' },
        OUTBOX_LOGS.SIGNAL_PROCESSING_ERROR,
      )
      expect(mockCaptureError).toHaveBeenCalledWith(expect.any(Error), { publicId: 'não é json{' })
    })

    it('onSignal lança: loga SIGNAL_PROCESSING_ERROR e captura no Sentry', async () => {
      const signalError = new Error('falha ao processar sinal')
      const onSignal = vi.fn().mockRejectedValue(signalError)

      await OutboxSignal.subscribe(onSignal)

      const subscriber = instances[0]
      const rawMessage = JSON.stringify({ publicId: 'evt-1', event: { publicId: 'evt-1' } })
      subscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, rawMessage)
      await Promise.resolve()
      await Promise.resolve()

      expect(logger.error).toHaveBeenCalledWith(
        { err: signalError, publicId: rawMessage },
        OUTBOX_LOGS.SIGNAL_PROCESSING_ERROR,
      )
      expect(mockCaptureError).toHaveBeenCalledWith(signalError, { publicId: rawMessage })
    })
  })

  describe('disconnect', () => {
    it('encerra os clientes ainda abertos', async () => {
      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)
      const publisher = instances[0]

      await OutboxSignal.disconnect()

      expect(publisher.quit).toHaveBeenCalledTimes(1)
    })

    it('não chama quit em um cliente que já está `end`', async () => {
      // The branch the ternary in disconnect() exists for: ioredis throws on
      // quit() after the connection has ended, so a second shutdown — or one
      // racing a connection that closed itself — must skip it.
      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)
      const publisher = instances[0]
      publisher.status = 'end'

      await OutboxSignal.disconnect()

      expect(publisher.quit).not.toHaveBeenCalled()
    })
  })

  describe('erros ioredis de conexão (publisher/subscriber) — não capturados no Sentry', () => {
    it('erro inesperado no publisher: loga PUBLISHER_ERROR sem capturar no Sentry', async () => {
      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)
      const publisher = instances[0]

      publisher.emit('error', new Error('falha de rede não classificada como outage'))

      expect(logger.error).toHaveBeenCalledWith({ err: expect.any(Error) }, OUTBOX_LOGS.PUBLISHER_ERROR)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('conexão e fechamento do publisher são logados', async () => {
      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)
      const publisher = instances[0]

      publisher.emit('connect')
      publisher.emit('close')

      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PUBLISHER_CONNECTED)
      expect(logger.warn).toHaveBeenCalledWith(OUTBOX_LOGS.PUBLISHER_CLOSED)
    })

    it('conexão, erro e fechamento do subscriber são logados', async () => {
      await OutboxSignal.subscribe(vi.fn())
      const subscriber = instances[0]
      const error = new Error('falha de rede no subscriber')

      subscriber.emit('connect')
      subscriber.emit('error', error)
      subscriber.emit('close')

      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SUBSCRIBER_CONNECTED)
      expect(logger.error).toHaveBeenCalledWith({ err: error }, OUTBOX_LOGS.SUBSCRIBER_ERROR)
      expect(logger.warn).toHaveBeenCalledWith(OUTBOX_LOGS.SUBSCRIBER_CLOSED)
      // The lifecycle handlers are diagnostics, not failures: an outage is
      // expected to be noisy in the log and silent in Sentry.
      expect(mockCaptureError).not.toHaveBeenCalled()
    })
  })
})
