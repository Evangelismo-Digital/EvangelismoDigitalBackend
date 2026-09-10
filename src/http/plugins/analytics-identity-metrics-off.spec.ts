/**
 * The identity plugin with metrics DISABLED.
 *
 * Deliberately a separate file with no `@env/index` mock: `.env.test` sets
 * `METRICS_ENABLED=false`, so the counters really are null here — which is the
 * whole point. `METRICS_ENABLED=false` is a supported production configuration,
 * and the optional chaining on the counter is the only thing standing between
 * that and a TypeError on every rotated cookie.
 *
 * Without this, the `?.` reads as defensive decoration; a mutation run confirmed
 * that removing it broke nothing any test could see.
 */
import fastifyCookie from '@fastify/cookie'
import fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyticsIdentity } from './analytics-identity.plugin'
import { VISITOR_COOKIE } from '@http/cookies/options'

const CURRENT = 'current-secret-current-secret-current-32+'
const PREVIOUS = 'previous-secret-previous-secret-previous'

let app: FastifyInstance

async function cookieSignedWith(secret: string, value: string): Promise<string> {
  const signer = fastify()
  await signer.register(fastifyCookie, { secret })
  await signer.ready()
  const signed = signer.signCookie(value)
  await signer.close()

  return `${VISITOR_COOKIE}=${signed}`
}

beforeEach(async () => {
  app = fastify()
  await app.register(fastifyCookie, { secret: [CURRENT, PREVIOUS] })
  await app.register(analyticsIdentity)
  app.get('/probe', async (request) => ({ visitorId: request.visitorId }))
  await app.ready()
})

afterEach(async () => {
  await app.close()
})

describe('analytics identity with METRICS_ENABLED=false', () => {
  it('reads a rotated cookie without throwing when the counter does not exist', async () => {
    const cookie = await cookieSignedWith(PREVIOUS, 'visitor-abc')

    const response = await app.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    // A 500 here would mean telemetry being off breaks identity — analytics
    // instrumentation must never be load-bearing for the request itself.
    expect(response.statusCode).toBe(200)
    expect(response.json().visitorId).toBe('visitor-abc')
  })

  it('reads a current-secret cookie without throwing', async () => {
    const cookie = await cookieSignedWith(CURRENT, 'visitor-abc')

    const response = await app.inject({ method: 'GET', url: '/probe', headers: { cookie } })

    expect(response.statusCode).toBe(200)
    expect(response.json().visitorId).toBe('visitor-abc')
  })
})
