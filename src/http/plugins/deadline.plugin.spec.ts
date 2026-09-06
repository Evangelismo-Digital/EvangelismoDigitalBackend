import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { requestDeadline, CLIENT_DISCONNECTED_REASON } from './deadline.plugin'
import { Deadline } from 'core/shared/deadline'
import { HTTP_DEADLINE_POLICIES } from '@http/policies/deadline'

type Hook = (request: FakeRequest, reply: FakeReply, done: () => void) => void

interface FakeRequest {
  routeOptions?: { config?: { deadlineMs?: number } }
  raw: EventEmitter
  deadline?: Deadline
}

interface FakeReply {
  raw: { writableEnded: boolean }
}

/** Drives the plugin's hooks without standing up a Fastify server. */
function mountPlugin() {
  const hooks: Record<string, Hook> = {}
  const app = {
    decorateRequest: vi.fn(),
    addHook: (name: string, fn: Hook) => {
      hooks[name] = fn
    },
  }

  // fastify-plugin wraps the function; unwrap to the original implementation.
  const plugin = requestDeadline as unknown as ((app: unknown, opts: unknown) => Promise<void>) & {
    [key: symbol]: unknown
  }

  return { app, hooks, plugin }
}

async function requestWith(budgetMs?: number) {
  const { app, hooks, plugin } = mountPlugin()
  await plugin(app, {})

  const request: FakeRequest = {
    routeOptions: budgetMs === undefined ? {} : { config: { deadlineMs: budgetMs } },
    raw: new EventEmitter(),
  }
  const reply: FakeReply = { raw: { writableEnded: false } }

  hooks.onRequest(request, reply, () => {})

  return { request, reply, hooks }
}

describe('requestDeadline plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('routes that declare a budget', () => {
    it('gives the request a bounded deadline', async () => {
      const { request } = await requestWith(8_000)

      expect(request.deadline).toBeInstanceOf(Deadline)
      expect(request.deadline!.remainingMs()).toBe(8_000)
      expect(request.deadline!.expired).toBe(false)
    })

    it('expires the request once the budget elapses', async () => {
      const { request } = await requestWith(8_000)

      vi.advanceTimersByTime(8_000)

      expect(request.deadline!.expired).toBe(true)
    })

    it('uses the configured budget, not a hardcoded one', async () => {
      const { request } = await requestWith(1_234)

      expect(request.deadline!.remainingMs()).toBe(1_234)
    })
  })

  describe('routes that declare none', () => {
    it('leaves the request unbounded, so no existing endpoint changes behaviour', async () => {
      const { request } = await requestWith(undefined)

      expect(request.deadline!.remainingMs()).toBe(Infinity)

      vi.advanceTimersByTime(60 * 60 * 1_000)
      expect(request.deadline!.expired).toBe(false)
    })

    it('is unbounded when the route has no config object at all', async () => {
      const { app, hooks, plugin } = mountPlugin()
      await plugin(app, {})

      const request: FakeRequest = { raw: new EventEmitter() }
      hooks.onRequest(request, { raw: { writableEnded: false } }, () => {})

      expect(request.deadline!.expired).toBe(false)
    })
  })

  describe('client disconnect', () => {
    it('expires the deadline when the client hangs up before the answer', async () => {
      const { request, reply } = await requestWith(8_000)

      reply.raw.writableEnded = false
      request.raw.emit('close')

      expect(request.deadline!.expired).toBe(true)
      expect(request.deadline!.signal.reason).toBe(CLIENT_DISCONNECTED_REASON)
    })

    it('does NOT expire the deadline when the connection closes after a normal response', async () => {
      // Node emits `close` for every teardown, successful ones included. Without
      // checking the response state, every request would cancel itself on exit.
      const { request, reply } = await requestWith(8_000)

      reply.raw.writableEnded = true
      request.raw.emit('close')

      expect(request.deadline!.expired).toBe(false)
      expect(request.deadline!.signal.aborted).toBe(false)
    })

    it('reports the disconnect distinctly from a spent budget', async () => {
      const { request, reply } = await requestWith(8_000)

      reply.raw.writableEnded = false
      request.raw.emit('close')

      // Operators need to tell "nobody was listening" from "we were too slow".
      expect(request.deadline!.asError().originalError).toBe(CLIENT_DISCONNECTED_REASON)
    })
  })

  describe('cleanup', () => {
    it('releases the timer once the response is out', async () => {
      const { request, hooks } = await requestWith(60_000)
      const before = vi.getTimerCount()

      hooks.onResponse(request, { raw: { writableEnded: true } }, () => {})

      expect(vi.getTimerCount()).toBeLessThan(before)
    })

    it('does not cancel the request while releasing its timer', async () => {
      const { request, hooks } = await requestWith(60_000)

      hooks.onResponse(request, { raw: { writableEnded: true } }, () => {})

      expect(request.deadline!.signal.aborted).toBe(false)
    })
  })

  describe('plugin wiring', () => {
    it('decorates the request under the name the rest of the app reads', async () => {
      const { app, plugin } = mountPlugin()

      await plugin(app, {})

      expect(app.decorateRequest).toHaveBeenCalledWith('deadline')
    })

    it('calls done() on both hooks — omitting it hangs every request', async () => {
      const { app, hooks, plugin } = mountPlugin()
      await plugin(app, {})

      const onRequestDone = vi.fn()
      const onResponseDone = vi.fn()
      const request: FakeRequest = { routeOptions: { config: { deadlineMs: 8_000 } }, raw: new EventEmitter() }

      hooks.onRequest(request, { raw: { writableEnded: false } }, onRequestDone)
      hooks.onResponse(request, { raw: { writableEnded: true } }, onResponseDone)

      expect(onRequestDone).toHaveBeenCalledOnce()
      expect(onResponseDone).toHaveBeenCalledOnce()
    })

    it('registers under a stable plugin name', () => {
      // fastify-plugin stores the name in its metadata; other plugins and the
      // encapsulation checks refer to it.
      const meta = (requestDeadline as unknown as Record<symbol, { name?: string }>)[Symbol.for('plugin-meta')]
      expect(meta?.name).toBe('request-deadline')
    })

    it('tolerates an onResponse for a request that never got a deadline', async () => {
      const { app, hooks, plugin } = mountPlugin()
      await plugin(app, {})

      const request: FakeRequest = { raw: new EventEmitter() }

      expect(() => hooks.onResponse(request, { raw: { writableEnded: true } }, () => {})).not.toThrow()
    })
  })

  describe('the configured policy', () => {
    it('bounds /churches/nearest at 8s', () => {
      expect(HTTP_DEADLINE_POLICIES.churches.nearest).toBe(8_000)
    })
  })
})
