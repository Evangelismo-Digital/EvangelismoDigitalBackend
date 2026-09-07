import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { OUTBOX_LOGS } from 'messages/constants/logs/outbox'
import { env } from '@env/index'
import { logger } from '@lib/logger'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import Redis from 'ioredis'
import { captureError } from '@lib/sentry/capture'
import {
  collectMetricsOutboxSignalPublished,
  collectMetricsOutboxSignalPublishFailed,
} from '@lib/metrics/outbox-metrics'

/** What {@link OutboxSignal.publish} puts on the channel. */
interface OutboxSignalPayload {
  publicId: string
  event: IOutboxEvent
}

/**
 * Narrows a parsed message to the payload this module publishes.
 *
 * Deliberately shallow: it checks the two fields the callback dereferences and
 * trusts the event's own shape, because the alternative — validating an entire
 * outbox event on every signal — would duplicate the repository's contract on
 * the hot path for a message we ourselves published.
 *
 * Mutation note: replacing `typeof value !== 'object'` with `false` survives,
 * and is equivalent for every input `JSON.parse` can produce. A string, number,
 * boolean or array all fail the two property checks below anyway, and `null` is
 * caught by the second operand. The `typeof` guard earns its place only against
 * a non-JSON caller — a function carrying the right properties — so it stays,
 * documented, rather than being deleted or chased with a contrived test.
 */
function isOutboxSignalPayload(value: unknown): value is OutboxSignalPayload {
  if (typeof value !== 'object' || value === null) return false

  // Narrowed through `Record<string, unknown>`, not `Partial<OutboxSignalPayload>`:
  // asserting the target shape first would make each check below look redundant
  // to the type checker while the value is, in fact, still arbitrary JSON.
  const candidate = value as Record<string, unknown>

  return typeof candidate.publicId === 'string' && typeof candidate.event === 'object' && candidate.event !== null
}

/** Exponential reconnect backoff for the pub/sub clients. */
const RECONNECT_BACKOFF_STEP_MS = 100
const RECONNECT_BACKOFF_MAX_MS = 5_000

const baseConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
}

let publisher: Redis | null = null
let subscriber: Redis | null = null

function getPublisher() {
  if (!publisher) {
    publisher = new Redis({
      ...baseConfig,
      enableOfflineQueue: true,
      commandTimeout: 2000,
    })

    publisher.on('connect', () => {
      logger.info(OUTBOX_LOGS.PUBLISHER_CONNECTED)
    })
    publisher.on('error', (err: unknown) => {
      logger.error({ err }, OUTBOX_LOGS.PUBLISHER_ERROR)
    })
    publisher.on('close', () => {
      logger.warn(OUTBOX_LOGS.PUBLISHER_CLOSED)
    })
  }

  return publisher
}

function getSubscriber() {
  if (!subscriber) {
    subscriber = new Redis({
      ...baseConfig,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      retryStrategy: (times) => {
        const delay = Math.min(Math.pow(2, times) * RECONNECT_BACKOFF_STEP_MS, RECONNECT_BACKOFF_MAX_MS)
        logger.warn({
          times,
          delay,
        })

        return delay
      },
    })

    subscriber.on('connect', () => {
      logger.info(OUTBOX_LOGS.SUBSCRIBER_CONNECTED)
    })
    subscriber.on('error', (err: unknown) => {
      logger.error({ err }, OUTBOX_LOGS.SUBSCRIBER_ERROR)
    })
    subscriber.on('close', () => {
      logger.warn(OUTBOX_LOGS.SUBSCRIBER_CLOSED)
    })
  }

  return subscriber
}

/** Connects a client only if it hasn't connected yet. */
async function ensureConnected(client: Redis, name: string): Promise<void> {
  if (client.status === 'wait' || client.status === 'close' || client.status === 'end') {
    logger.info(`Conectando ${name}...`)
    await client.connect()
  }
}

type MessageListener = (channel: string, message: string) => void
let activeMessageListener: MessageListener | null = null

/**
 * Builds the pub/sub message handler for a given callback.
 *
 * Extracted from `subscribe` so that method stays about subscription lifecycle
 * — connect, detach the previous listener, attach the new one — while this
 * stays about one message: right channel, valid payload, dispatch, never throw.
 */
function createMessageHandler(
  onSignal: (publicId: string, event: IOutboxEvent) => Promise<void>,
): (channel: string, message: string) => Promise<void> {
  return async (channel: string, message: string): Promise<void> => {
    if (channel !== REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL) {
      logger.warn({ channel }, OUTBOX_LOGS.UNEXPECTED_CHANNEL)
      return
    }

    try {
      // `JSON.parse` returns `any`, so `parsed.publicId` and `parsed.event`
      // used to be unchecked reads handed straight to the callback. The
      // message crosses a process boundary through Redis, where a payload from
      // an older deploy — or from anything else publishing on this channel —
      // is entirely possible, so it is narrowed before use.
      const parsed: unknown = JSON.parse(message)

      if (!isOutboxSignalPayload(parsed)) {
        logger.warn({ message }, OUTBOX_LOGS.UNEXPECTED_CHANNEL)
        return
      }

      await onSignal(parsed.publicId, parsed.event)
    } catch (err) {
      logger.error({ err, publicId: message }, OUTBOX_LOGS.SIGNAL_PROCESSING_ERROR)
      captureError(err, { publicId: message })
    }
  }
}

export const OutboxSignal = {
  /**
   * Publishes a wakeup signal after a successful outbox write.
   * Fire-and-forget by design: if Redis is unavailable the cron job is the
   * durable fallback, so we swallow the error here intentionally.
   *
   * Call this from your Controller/Service *after* the DB transaction commits.
   */
  async publishNewItem(publicId: string, event: IOutboxEvent): Promise<void> {
    try {
      const client = getPublisher()
      await ensureConnected(client, 'OutboxPublisher')
      await client.publish(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL, JSON.stringify({ publicId, event }))
      collectMetricsOutboxSignalPublished?.inc()
    } catch (err) {
      collectMetricsOutboxSignalPublishFailed?.inc()
      logger.warn({ err }, OUTBOX_LOGS.SIGNAL_PUBLISH_FAILED)
    }
  },

  /**
   * Subscribes the Worker to the outbox channel.
   *
   * Seguro para ser chamado múltiplas vezes: o listener anterior é removido
   * com precisão via `off` antes de registrar o novo, evitando:
   *   1. Listeners duplicados (processamento duplo por mensagem)
   *   2. Memory leak de closures antigas de `onSignal`
   *   3. Destruição acidental dos listeners de lifecycle do subscriber
   *
   * @param onSignal - async callback invoked when a new item is signalled.
   *                   Errors thrown here are caught and logged — they won't
   *                   crash the worker process.
   */
  async subscribe(onSignal: (publicId: string, event: IOutboxEvent) => Promise<void>): Promise<void> {
    try {
      const client = getSubscriber()
      await ensureConnected(client, 'OutboxSubscriber')

      if (activeMessageListener !== null) {
        client.off('message', activeMessageListener)
        logger.info(OUTBOX_LOGS.LISTENER_REMOVED)
      }

      const handleMessage = createMessageHandler(onSignal)

      // ioredis' listener signature returns void: the emitter neither awaits
      // the promise nor observes its rejection. `handleMessage` already
      // swallows every error it can produce, so the discard is deliberate —
      // and writing it out is what keeps it deliberate the next time someone
      // adds a `throw` in there.
      activeMessageListener = (channel: string, message: string) => {
        void handleMessage(channel, message)
      }

      client.on('message', activeMessageListener)

      await client.subscribe(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL)
    } catch (err) {
      logger.error({ err }, OUTBOX_LOGS.SUBSCRIBE_ERROR)
      captureError(err)
    }
  },

  async disconnect(): Promise<void> {
    const targets = [publisher, subscriber].filter((client): client is Redis => client !== null)

    if (activeMessageListener !== null) {
      if (subscriber !== null) {
        subscriber.off('message', activeMessageListener)
      }

      activeMessageListener = null
    }

    // Same reason as closeAllRedisConnections: clearing the module state before
    // the await means a connect() that races the shutdown cannot have its new
    // clients overwritten with null and left open.
    publisher = null
    subscriber = null

    await Promise.allSettled(targets.map((client) => (client.status === 'end' ? Promise.resolve() : client.quit())))
  },
}
