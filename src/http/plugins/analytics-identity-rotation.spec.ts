/**
 * Cookie-secret rotation as seen by the identity plugin.
 *
 * Metrics are off in `.env.test`, so the counter is null unless env is mocked
 * before any import — the same constraint `analytics-retention-metrics.spec.ts`
 * works around, and the reason this lives in its own file.
 *
 * Driven through a real Fastify instance with a real `@fastify/cookie`: the
 * behaviour under test is the library's `renew` flag reaching my code, and a
 * hand-built double for `unsignCookie` would assert only that I wrote the mock
 * the way I expected.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@env/index', () => ({
  env: {
    METRICS_ENABLED: true,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
  },
}))

import fastifyCookie from '@fastify/cookie'
import fastify, { type FastifyInstance } from 'fastify'
import type { Metric } from 'prom-client'
import { analyticsIdentity } from './analytics-identity.plugin'
import { SESSION_COOKIE, VISITOR_COOKIE } from '@http/cookies/options'
import { collectMetricsAnalyticsCookieSupersededSecret } from '@lib/metrics/analytics-metrics'

const CURRENT = 'current-secret-current-secret-current-32+'
const PREVIOUS = 'previous-secret-previous-secret-previous'

async function metricValue(metric: Metric | null, labels: Record<string, string> = {}): Promise<number> {
  if (!metric) return 0

  const data = await (
    metric as unknown as {
      get: () => Promise<{ values: Array<{ value: number; labels: Record<string, string> }> }>
    }
  ).get()

  return data.values.find((v) => Object.entries(labels).every(([k, val]) => v.labels[k] === val))?.value ?? 0
}

/** An app whose cookie plugin holds `secrets`, exposing what the plugin read. */
async function appWith(secrets: string | string[]): Promise<FastifyInstance> {
  const app = fastify()
  await app.register(fastifyCookie, { secret: secrets })
  await app.register(analyticsIdentity)
  app.get('/probe', async (request) => ({ visitorId: request.visitorId, sessionId: request.sessionId }))
  await app.ready()
  return app
}

async function cookieSignedWith(secret: string, name: string, value: string): Promise<string> {
  const signer = fastify()
  await signer.register(fastifyCookie, { secret })
  await signer.ready()
  const signed = signer.signCookie(value)
  await signer.close()

  return `${name}=${signed}`
}

let rotated: FastifyInstance

beforeEach(async () => {
  rotated = await appWith([CURRENT, PREVIOUS])
})

describe('identity plugin during a secret rotation', () => {
  it('still reads a cookie signed with the previous secret', async () => {
    const cookie = await cookieSignedWith(PREVIOUS, VISITOR_COOKIE, 'visitor-abc')

    const response = await rotated.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    // The rotation window exists so this keeps working; a visitor must not be
    // made anonymous merely because a new key was deployed.
    expect(response.json().visitorId).toBe('visitor-abc')

    await rotated.close()
  })

  it('counts it as carrying a superseded secret', async () => {
    const before = await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })
    const cookie = await cookieSignedWith(PREVIOUS, VISITOR_COOKIE, 'visitor-abc')

    await rotated.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    expect(await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })).toBe(
      before + 1,
    )

    await rotated.close()
  })

  it('does NOT count a cookie already on the current secret', async () => {
    const before = await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })
    const cookie = await cookieSignedWith(CURRENT, VISITOR_COOKIE, 'visitor-abc')

    await rotated.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    // The counter reaching zero is the evidence that COOKIE_SECRET_PREVIOUS can
    // be removed, so a false positive here would keep a dead key alive forever.
    expect(await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })).toBe(before)

    await rotated.close()
  })

  it('labels the counter per cookie, so the two can be told apart', async () => {
    const before = await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: SESSION_COOKIE })
    const cookie = await cookieSignedWith(PREVIOUS, SESSION_COOKIE, 'session-abc')

    await rotated.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    expect(await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: SESSION_COOKIE })).toBe(
      before + 1,
    )

    await rotated.close()
  })

  it('does not count — or accept — a cookie signed with an unknown secret', async () => {
    const before = await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })
    const cookie = await cookieSignedWith('stranger-secret-stranger-secret-stranger', VISITOR_COOKIE, 'visitor-abc')

    const response = await rotated.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    expect(response.json().visitorId).toBeNull()
    expect(await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })).toBe(before)

    await rotated.close()
  })

  /**
   * The case the plugin's own docblock claims to handle and nothing tested.
   *
   * A cookie of the form `.<hmac-of-empty-string>` unsigns to
   * `{ valid: true, value: '' }` — the signature is genuine, the payload is
   * empty. Accepting it would make `''` a visitor id, and every such caller
   * would share one identity row.
   */
  it('rejects a validly-signed EMPTY value rather than admitting it as an id', async () => {
    const cookie = await cookieSignedWith(CURRENT, VISITOR_COOKIE, '')

    const response = await rotated.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    expect(response.json().visitorId).toBeNull()

    await rotated.close()
  })

  it('registers under the name other plugins would depend on', async () => {
    // The `fp` name is the handle for a `dependencies: ['analytics-identity']`
    // declaration; if it is wrong, that dependency fails at boot, not here.
    expect(rotated.hasPlugin('analytics-identity')).toBe(true)

    await rotated.close()
  })

  it('decorates the request so identity is null BEFORE the read hook runs', async () => {
    await rotated.close()

    const app = fastify()
    await app.register(fastifyCookie, { secret: CURRENT })
    await app.register(analyticsIdentity)

    let seenBeforePreHandler: unknown = 'not-observed'
    let sessionSeenBeforePreHandler: unknown = 'not-observed'
    // onRequest runs ahead of the plugin's preHandler, so this observes the
    // decorated DEFAULT. Without `decorateRequest` it would be undefined, and
    // anything reading identity early would see a different absence.
    app.addHook('onRequest', async (request) => {
      seenBeforePreHandler = request.visitorId
      sessionSeenBeforePreHandler = request.sessionId
    })
    app.get('/early', async () => ({ ok: true }))
    await app.ready()

    await app.inject({ method: 'GET', url: '/early' })

    // Both ids, not just one: they are decorated by two separate calls, and a
    // typo in either leaves that field undefined instead of null.
    expect(seenBeforePreHandler).toBeNull()
    expect(sessionSeenBeforePreHandler).toBeNull()

    await app.close()
  })

  it('does not count anything when no rotation is configured', async () => {
    await rotated.close()
    const single = await appWith(CURRENT)
    const before = await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })
    const cookie = await cookieSignedWith(CURRENT, VISITOR_COOKIE, 'visitor-abc')

    await single.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    expect(await metricValue(collectMetricsAnalyticsCookieSupersededSecret, { cookie: VISITOR_COOKIE })).toBe(before)

    await single.close()
  })
})
