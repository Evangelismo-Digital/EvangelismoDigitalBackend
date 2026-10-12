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

class FakeRedis {
  handlers: Record<string, Handler[]> = {}
  publishError: Error | null = null
  subscribeError: Error | null = null

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

  publish = vi.fn(async () => {
    if (this.publishError) throw this.publishError
    return 1
  })

  subscribe = vi.fn(async () => {
    if (this.subscribeError) throw this.subscribeError
    return 1
  })

  status: string = 'ready'
  connect = vi.fn(async () => {})
}

const mockPublisher = new FakeRedis()
const mockSubscriber = new FakeRedis()

vi.mock('@lib/redis/clients/clients', () => ({
  getOutboxPublisher: () => mockPublisher,
  getOutboxSubscriber: () => mockSubscriber,
}))

import { OutboxSignal } from './outbox-signal'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { logger } from '@lib/logger'

describe('OutboxSignal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPublisher.publishError = null
    mockSubscriber.subscribeError = null
    mockSubscriber.handlers = {}
  })

  afterEach(() => {
    OutboxSignal.disconnect()
  })

  describe('publishNewItem', () => {
    it('publica a mensagem com sucesso, sem captura no Sentry', async () => {
      await OutboxSignal.publishNewItem('evt-1', { publicId: 'evt-1' } as never)

      expect(mockPublisher.publish).toHaveBeenCalledWith(
        REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL,
        JSON.stringify({ publicId: 'evt-1', event: { publicId: 'evt-1' } }),
      )
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('falha ao publicar (fire-and-forget): loga warn e NÃO captura no Sentry (cron é o fallback documentado)', async () => {
      const publishError = new Error('conexão recusada')
      mockPublisher.publishError = publishError

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

      mockSubscriber.emit(
        'message',
        REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL,
        JSON.stringify({ publicId: 'evt-1', event }),
      )
      await Promise.resolve()

      expect(onSignal).toHaveBeenCalledWith('evt-1', event)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('payload sem o campo `event`: não chama onSignal e não captura no Sentry', async () => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      mockSubscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId: 'evt-1' }))
      await Promise.resolve()

      expect(onSignal).not.toHaveBeenCalled()
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('payload sem `publicId`: não chama onSignal', async () => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      mockSubscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ event: { id: 1 } }))
      await Promise.resolve()

      expect(onSignal).not.toHaveBeenCalled()
    })

    it.each([
      ['uma string', JSON.stringify('apenas uma string')],
      ['um número', JSON.stringify(42)],
      ['null', JSON.stringify(null)],
      ['um array', JSON.stringify(['evt-1'])],
      ['um objeto com event null', JSON.stringify({ publicId: 'evt-1', event: null })],
    ])('payload que é %s e não um objeto de sinal: não chama onSignal', async (_label, rawMessage) => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      mockSubscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, rawMessage)
      await new Promise((resolve) => setImmediate(resolve))

      expect(onSignal).not.toHaveBeenCalled()
      expect(mockCaptureError).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith({ message: rawMessage }, OUTBOX_LOGS.UNEXPECTED_CHANNEL)
    })

    it('falha ao se inscrever (client.subscribe rejeita): loga SUBSCRIBE_ERROR e captura no Sentry', async () => {
      const subscribeError = new Error('falha ao inscrever')
      mockSubscriber.subscribeError = subscribeError

      await OutboxSignal.subscribe(vi.fn())

      expect(logger.error).toHaveBeenCalledWith({ err: subscribeError }, OUTBOX_LOGS.SUBSCRIBE_ERROR)
      expect(mockCaptureError).toHaveBeenCalledWith(subscribeError)
    })

    it('mensagem recebida em canal inesperado: warn, sem chamar onSignal, sem captura', async () => {
      const onSignal = vi.fn()

      await OutboxSignal.subscribe(onSignal)

      mockSubscriber.emit('message', 'canal-errado', 'qualquer coisa')
      await Promise.resolve()

      expect(onSignal).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith({ channel: 'canal-errado' }, OUTBOX_LOGS.UNEXPECTED_CHANNEL)
      expect(mockCaptureError).not.toHaveBeenCalled()
    })

    it('mensagem malformada (JSON inválido): loga SIGNAL_PROCESSING_ERROR e captura no Sentry', async () => {
      await OutboxSignal.subscribe(vi.fn())

      mockSubscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, 'não é json{')
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

      const rawMessage = JSON.stringify({ publicId: 'evt-1', event: { publicId: 'evt-1' } })
      mockSubscriber.emit('message', REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, rawMessage)
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
    it('remove o listener de mensagem', async () => {
      await OutboxSignal.subscribe(vi.fn())

      expect(mockSubscriber.handlers['message']?.length).toBe(1)

      OutboxSignal.disconnect()

      expect(mockSubscriber.handlers['message']?.length).toBe(0)
    })
  })

  describe('connection events', () => {
    it('should log publisher connect, error, and close events', async () => {
      await OutboxSignal.publishNewItem('test', {} as never) // Ensure publisher is initialized

      mockPublisher.emit('connect')
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.PUBLISHER_CONNECTED)

      const err = new Error('test')
      mockPublisher.emit('error', err)
      expect(logger.error).toHaveBeenCalledWith({ err }, OUTBOX_LOGS.PUBLISHER_ERROR)

      mockPublisher.emit('close')
      expect(logger.warn).toHaveBeenCalledWith(OUTBOX_LOGS.PUBLISHER_CLOSED)
    })

    it('should log subscriber connect, error, and close events', async () => {
      await OutboxSignal.subscribe(vi.fn()) // Ensure subscriber is initialized

      mockSubscriber.emit('connect')
      expect(logger.info).toHaveBeenCalledWith(OUTBOX_LOGS.SUBSCRIBER_CONNECTED)

      const err = new Error('test')
      mockSubscriber.emit('error', err)
      expect(logger.error).toHaveBeenCalledWith({ err }, OUTBOX_LOGS.SUBSCRIBER_ERROR)

      mockSubscriber.emit('close')
      expect(logger.warn).toHaveBeenCalledWith(OUTBOX_LOGS.SUBSCRIBER_CLOSED)
    })

    it('should call connect if status is wait, close, or end', async () => {
      mockPublisher.status = 'wait'
      await OutboxSignal.publishNewItem('test2', {} as never)
      expect(logger.info).toHaveBeenCalledWith('Conectando OutboxPublisher...')
      expect(mockPublisher.connect).toHaveBeenCalledOnce()

      mockSubscriber.status = 'close'
      await OutboxSignal.subscribe(vi.fn())
      expect(logger.info).toHaveBeenCalledWith('Conectando OutboxSubscriber...')
      expect(mockSubscriber.connect).toHaveBeenCalledOnce()
    })
  })
})
