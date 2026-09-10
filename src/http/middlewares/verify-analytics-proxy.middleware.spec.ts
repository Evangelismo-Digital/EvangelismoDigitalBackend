import fc from 'fast-check'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { env } from '@env/index'
import { ANALYTICS_ERRORS } from 'messages/errors/analytics'
import { ANALYTICS_PROXY_HEADER, verifyAnalyticsProxy } from './verify-analytics-proxy.middleware'

function makeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return reply as unknown as FastifyReply & typeof reply
}

function makeRequest(headers: Record<string, string | string[] | undefined>) {
  return { headers } as unknown as FastifyRequest
}

const VALID = env.ANALYTICS_PROXY_SECRET

describe('verifyAnalyticsProxy middleware', () => {
  it('passes through when the header matches the configured secret', async () => {
    const reply = makeReply()

    await verifyAnalyticsProxy(makeRequest({ [ANALYTICS_PROXY_HEADER]: VALID }), reply)

    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('refuses a request with no proxy header', async () => {
    const reply = makeReply()

    await verifyAnalyticsProxy(makeRequest({}), reply)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith({ message: ANALYTICS_ERRORS.PROXY_REQUIRED.message })
  })

  it('refuses a wrong secret', async () => {
    const reply = makeReply()

    await verifyAnalyticsProxy(makeRequest({ [ANALYTICS_PROXY_HEADER]: 'wrong-secret-wrong-secret-wrong-1' }), reply)

    expect(reply.code).toHaveBeenCalledWith(401)
  })

  it('refuses a secret that is a prefix of the real one', async () => {
    const reply = makeReply()

    await verifyAnalyticsProxy(makeRequest({ [ANALYTICS_PROXY_HEADER]: VALID.slice(0, -1) }), reply)

    expect(reply.code).toHaveBeenCalledWith(401)
  })

  it('refuses a repeated header rather than picking one of the values', async () => {
    const reply = makeReply()

    await verifyAnalyticsProxy(makeRequest({ [ANALYTICS_PROXY_HEADER]: [VALID, 'other'] }), reply)

    expect(reply.code).toHaveBeenCalledWith(401)
  })

  it('does not disclose why the request was refused', async () => {
    const missing = makeReply()
    const wrong = makeReply()

    await verifyAnalyticsProxy(makeRequest({}), missing)
    await verifyAnalyticsProxy(makeRequest({ [ANALYTICS_PROXY_HEADER]: 'nope' }), wrong)

    // An attacker must not be able to tell "no header" from "bad header".
    expect(missing.send.mock.calls).toEqual(wrong.send.mock.calls)
    expect(missing.code.mock.calls).toEqual(wrong.code.mock.calls)
  })

  it('refuses every value that is not exactly the secret, and never throws', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), async (candidate) => {
        fc.pre(candidate !== VALID)

        const reply = makeReply()
        await verifyAnalyticsProxy(makeRequest({ [ANALYTICS_PROXY_HEADER]: candidate }), reply)

        expect(reply.code).toHaveBeenCalledWith(401)
      }),
    )
  })
})

/**
 * The header name is a contract with the Next.js proxy, which sends it as a
 * literal string in `next.config.ts`. Every test above addresses it through the
 * exported constant, so renaming the constant would move implementation and
 * tests together and prove nothing — a mutation run confirmed exactly that by
 * emptying the string and surviving. These two pin the wire format itself.
 */
describe('proxy header wire contract', () => {
  it('is named x-analytics-proxy', () => {
    expect(ANALYTICS_PROXY_HEADER).toBe('x-analytics-proxy')
  })

  it('accepts a request addressed with the literal header name', async () => {
    const reply = makeReply()

    await verifyAnalyticsProxy(makeRequest({ 'x-analytics-proxy': VALID }), reply)

    expect(reply.code).not.toHaveBeenCalled()
  })
})
