/**
 * Integration — OutboxSignal Redis pub/sub against a real Redis (docker-compose).
 *
 * Opt-in: `npm run test:integration:full` with the compose stack up. Not in CI.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Redis from 'ioredis'
import { env } from '@env/index'
import { OutboxSignal } from './outbox-signal'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { IOutboxEvent, IOutboxEventStatus } from 'core/contracts/repository/outbox-repository.interface'

function makeEvent(publicId: string): IOutboxEvent {
  return {
    id: 1,
    publicId,
    type: 'FormSubmissionCreated',
    status: IOutboxEventStatus.PENDING,
    payload: { email: 'x@y.com' },
    attempts: 0,
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    sendingAt: undefined,
    expiresAt: undefined,
    pendingRecipients: [],
  }
}

describe('OutboxSignal (integration, real Redis pub/sub)', () => {
  afterEach(async () => {
    await OutboxSignal.disconnect()
  })

  afterAll(async () => {
    await OutboxSignal.disconnect()
  })

  it('publishNewItem → a subscribed worker receives (publicId, event) on the outbox channel', async () => {
    const received: Array<{ publicId: string; event: IOutboxEvent }> = []

    await OutboxSignal.subscribe(async (publicId, event) => {
      received.push({ publicId, event })
    })

    const event = makeEvent('evt-signal-1')
    await OutboxSignal.publishNewItem('evt-signal-1', event)

    await vi.waitFor(() => expect(received).toHaveLength(1))
    expect(received[0].publicId).toBe('evt-signal-1')
    expect(received[0].event.type).toBe('FormSubmissionCreated')
    // Dates cross the wire as ISO strings (payload is JSON-serialised).
    expect(new Date(received[0].event.occurredAt).toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('re-subscribing swaps the listener so a message is delivered exactly once', async () => {
    const first = vi.fn()
    const second = vi.fn()

    await OutboxSignal.subscribe(async () => first())
    await OutboxSignal.subscribe(async () => second())

    await OutboxSignal.publishNewItem('evt-signal-2', makeEvent('evt-signal-2'))

    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1))
    await new Promise((r) => setTimeout(r, 100))
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('ignores traffic published to an unrelated channel', async () => {
    const onSignal = vi.fn()
    await OutboxSignal.subscribe(async () => onSignal())

    const sidePublisher = new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD })
    await sidePublisher.publish('some-other-channel', JSON.stringify({ publicId: 'nope' }))
    await sidePublisher.quit()

    await new Promise((r) => setTimeout(r, 150))
    expect(onSignal).not.toHaveBeenCalled()
  })

  it('publishNewItem swallows errors when Redis is unreachable (cron is the durable fallback)', async () => {
    // Force a broken publisher by disconnecting after subscribe wired the clients.
    await OutboxSignal.subscribe(async () => {})
    await OutboxSignal.disconnect()

    // No throw even though the publisher was torn down.
    await expect(OutboxSignal.publishNewItem('evt-signal-3', makeEvent('evt-signal-3'))).resolves.toBeUndefined()
  })

  it('uses the documented outbox-signal channel name', () => {
    expect(REDIS_CONSTANTS.CHANNELS.OUTBOX_SIGNAL).toBe('outbox-signal')
  })
})
