import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app } from 'app'
import { env } from '@env/index'
import { prisma } from '@lib/prisma'
import { ANALYTICS_PROXY_HEADER } from '@middlewares/verify-analytics-proxy.middleware'
import { CONSENT_COOKIE, SESSION_COOKIE, VISITOR_COOKIE } from '@http/cookies/options'

/**
 * A distinct source IP per request — this file shares Redis with every other
 * suite, and without a forwarded address it presents as the same client as all
 * of them. Addresses come from 198.18.0.0/15, IANA's benchmarking range, which
 * is public enough that `trustProxy` keeps it rather than falling back to the
 * socket address.
 */
const ipOffset = Math.floor(Math.random() * 65_536)
let ipsIssued = 0

function createForwardedIp() {
  const host = (ipOffset + ipsIssued++) % 65_536
  return `198.18.${host >> 8}.${host & 0xff}`
}

const CONSENT_GRANTED = `${CONSENT_COOKIE}=v1:analytics=1,marketing=0`

function post(path: string) {
  return request(app.server)
    .post(path)
    .set('X-Forwarded-For', createForwardedIp())
    .set(ANALYTICS_PROXY_HEADER, env.ANALYTICS_PROXY_SECRET)
}

function cookiesOf(response: request.Response): string[] {
  return (response.headers['set-cookie'] as unknown as string[] | undefined) ?? []
}

function cookieNamed(response: request.Response, name: string): string | undefined {
  return cookiesOf(response).find((c) => c.startsWith(`${name}=`))
}

async function bootstrapSession() {
  const response = await post('/analytics/session').set('Cookie', [CONSENT_GRANTED]).send({})
  const visitor = cookieNamed(response, VISITOR_COOKIE)
  const session = cookieNamed(response, SESSION_COOKIE)

  return {
    response,
    // supertest wants `name=value`; Set-Cookie carries the attributes too.
    jar: [CONSENT_GRANTED, visitor!.split(';')[0], session!.split(';')[0]],
  }
}

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE analytics_visitors, analytics_sessions, analytics_events, users CASCADE',
  )
})

/**
 * REPLACES a test that asserted the opposite.
 *
 * The previous suite contained `'automatically sets visitor_id and session_id
 * cookies on any request'`, which passed because the analytics plugin was
 * registered globally. That behaviour is item 4 of the audit, not a feature: it
 * made /health responses uncacheable, had the load balancer's probe spending
 * HMAC on every check, and minted a throwaway visitor for every non-browser
 * client. The assertion is inverted deliberately — see §3.3.
 */
describe('Analytics identity is scoped to /analytics', () => {
  it('does NOT set cookies on /health', async () => {
    const response = await request(app.server).get('/health').set('X-Forwarded-For', createForwardedIp())

    expect(cookiesOf(response)).toHaveLength(0)
  })

  it('leaves /health cacheable', async () => {
    const response = await request(app.server).get('/health').set('X-Forwarded-For', createForwardedIp())

    expect(response.headers['set-cookie']).toBeUndefined()
  })
})

describe('POST /analytics/session', () => {
  it('mints a visitor and a session for a consenting first-time caller', async () => {
    const { response } = await bootstrapSession()

    expect(response.statusCode).toBe(204)
    expect(cookieNamed(response, VISITOR_COOKIE)).toBeDefined()
    expect(cookieNamed(response, SESSION_COOKIE)).toBeDefined()
  })

  it('writes exactly one visitor row', async () => {
    await bootstrapSession()

    expect(await prisma.analyticsVisitor.count()).toBe(1)
    expect(await prisma.analyticsSession.count()).toBe(1)
  })

  it('issues the visitor cookie with Path=/, HttpOnly and no Domain', async () => {
    const { response } = await bootstrapSession()
    const cookie = cookieNamed(response, VISITOR_COOKIE)!

    // The preconditions the __Host- prefix requires. A browser silently drops a
    // __Host- cookie that breaks any of them, so asserting the name alone would
    // prove nothing.
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).not.toContain('Domain=')
  })

  it('never lets an analytics response be cached', async () => {
    const { response } = await bootstrapSession()

    expect(response.headers['cache-control']).toBe('no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
  })

  it('emits NOTHING without consent', async () => {
    const response = await post('/analytics/session').send({})

    expect(response.statusCode).toBe(204)
    expect(cookiesOf(response)).toHaveLength(0)
    expect(await prisma.analyticsVisitor.count()).toBe(0)
  })

  it('emits nothing when consent is explicitly denied', async () => {
    const response = await post('/analytics/session')
      .set('Cookie', [`${CONSENT_COOKIE}=v1:analytics=0`])
      .send({})

    expect(cookiesOf(response)).toHaveLength(0)
    expect(await prisma.analyticsVisitor.count()).toBe(0)
  })

  it('reuses a still-valid session instead of fragmenting the visit', async () => {
    const { jar } = await bootstrapSession()

    const second = await post('/analytics/session').set('Cookie', jar).send({})

    expect(second.statusCode).toBe(204)
    expect(await prisma.analyticsSession.count()).toBe(1)

    const visitor = await prisma.analyticsVisitor.findFirst()
    expect(visitor?.sessionCount).toBe(1)
  })

  it('rotates the session on request, which is the logout hook', async () => {
    const { jar } = await bootstrapSession()

    const rotated = await post('/analytics/session').set('Cookie', jar).send({ rotate: true })

    expect(rotated.statusCode).toBe(204)
    expect(await prisma.analyticsSession.count()).toBe(2)

    const visitor = await prisma.analyticsVisitor.findFirst()
    expect(visitor?.sessionCount).toBe(2)
    expect(await prisma.analyticsVisitor.count()).toBe(1)
  })
})

describe('POST /analytics/events', () => {
  it('accepts a batch for an established identity', async () => {
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/events')
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'page_view', path: '/post/um', title: 'Um post' }] })

    expect(response.statusCode).toBe(204)
    expect(await prisma.analyticsEvent.count()).toBe(1)
  })

  it('records reading depth, which is the measurement the design exists for', async () => {
    const { jar } = await bootstrapSession()

    await post('/analytics/events')
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'page_exit', path: '/post/um', durationMs: 45_000, scrollDepth: 80 }] })

    const event = await prisma.analyticsEvent.findFirst()
    expect(event?.durationMs).toBe(45_000)
    expect(event?.scrollDepth).toBe(80)
  })

  it('writes every event of a batch', async () => {
    const { jar } = await bootstrapSession()

    await post('/analytics/events')
      .set('Cookie', jar)
      .send({
        events: [
          { eventType: 'page_view', path: '/a' },
          { eventType: 'click', path: '/a' },
          { eventType: 'page_exit', path: '/a', durationMs: 1000, scrollDepth: 10 },
        ],
      })

    expect(await prisma.analyticsEvent.count()).toBe(3)
  })

  it('slides the session window forward on each batch', async () => {
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/events')
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'page_view', path: '/a' }] })

    // Renewal, not minting: the same id with a fresh Max-Age. Without it the
    // 30-minute window would run from bootstrap, and a long read would stop
    // being recorded mid-article.
    const renewed = cookieNamed(response, SESSION_COOKIE)
    expect(renewed).toBeDefined()
    expect(renewed).toContain('Max-Age=1800')
  })

  it('DISCARDS events with no identity and writes no row', async () => {
    const response = await post('/analytics/events')
      .set('Cookie', [CONSENT_GRANTED])
      .send({ events: [{ eventType: 'page_view', path: '/a' }] })

    // 204 and not 400: a visible error teaches a probing caller what to fix, and
    // the frontend has nothing to do with the failure (§3.2).
    expect(response.statusCode).toBe(204)
    expect(await prisma.analyticsEvent.count()).toBe(0)
    expect(await prisma.analyticsVisitor.count()).toBe(0)
  })

  it('discards events carrying a tampered signature', async () => {
    const { jar } = await bootstrapSession()
    const tampered = jar.map((c) => (c.startsWith(VISITOR_COOKIE) ? `${VISITOR_COOKIE}=forged-value` : c))

    const response = await post('/analytics/events')
      .set('Cookie', tampered)
      .send({ events: [{ eventType: 'page_view', path: '/a' }] })

    expect(response.statusCode).toBe(204)
    expect(await prisma.analyticsEvent.count()).toBe(0)
  })

  it('never creates identity, however many times it is called', async () => {
    for (let i = 0; i < 3; i++) {
      await post('/analytics/events')
        .set('Cookie', [CONSENT_GRANTED])
        .send({ events: [{ eventType: 'page_view', path: '/a' }] })
    }

    // The old plugin minted a visitor per cookie-less request; this is the
    // assertion that pins item 3 and item 6 shut.
    expect(await prisma.analyticsVisitor.count()).toBe(0)
  })

  it('rejects an event type outside the allowlist', async () => {
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/events')
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'arbitrary_type', path: '/a' }] })

    expect(response.statusCode).toBe(400)
    expect(await prisma.analyticsEvent.count()).toBe(0)
  })

  it('rejects a batch larger than the ceiling', async () => {
    const { jar } = await bootstrapSession()
    const events = Array.from({ length: 51 }, () => ({ eventType: 'click', path: '/a' }))

    const response = await post('/analytics/events').set('Cookie', jar).send({ events })

    expect(response.statusCode).toBe(400)
  })

  it('rejects an oversized path', async () => {
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/events')
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'page_view', path: `/${'a'.repeat(3000)}` }] })

    expect(response.statusCode).toBe(400)
  })

  it('refuses a request that did not come through the proxy', async () => {
    const { jar } = await bootstrapSession()

    const response = await request(app.server)
      .post('/analytics/events')
      .set('X-Forwarded-For', createForwardedIp())
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'page_view', path: '/a' }] })

    expect(response.statusCode).toBe(401)
  })
})

describe('POST /analytics/identify', () => {
  async function createUser(username: string) {
    return prisma.user.create({
      data: {
        name: 'Leitor Autenticado',
        username,
        email: `${username}@example.com`,
        cpf: username.slice(0, 11).padEnd(11, '0'),
        passwordHash: 'not-a-real-hash',
      },
    })
  }

  function tokenFor(publicId: string) {
    return app.jwt.sign({ sub: publicId, role: 'DEFAULT' })
  }

  it('refuses an unauthenticated call', async () => {
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/identify').set('Cookie', jar).send({})

    expect(response.statusCode).toBe(401)
  })

  it('links the visitor and the current session to the authenticated user', async () => {
    const user = await createUser(`leitor${Date.now()}`)
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/identify')
      .set('Cookie', jar)
      .set('Authorization', `Bearer ${tokenFor(user.publicId)}`)
      .send({})

    expect(response.statusCode).toBe(204)

    const visitor = await prisma.analyticsVisitor.findFirst()
    const session = await prisma.analyticsSession.findFirst()
    expect(visitor?.userId).toBe(user.publicId)
    expect(session?.userId).toBe(user.publicId)
  })

  /**
   * The rule §3.7 calls non-negotiable. Accepting `userId` from the body would
   * let any caller attribute a stranger's browsing to themselves — or their own
   * to a stranger. The body is not read at all; this proves it.
   */
  it('IGNORES a userId supplied in the body and uses the JWT', async () => {
    const caller = await createUser(`caller${Date.now()}`)
    const victim = await createUser(`victim${Date.now()}`)
    const { jar } = await bootstrapSession()

    await post('/analytics/identify')
      .set('Cookie', jar)
      .set('Authorization', `Bearer ${tokenFor(caller.publicId)}`)
      .send({ userId: victim.publicId })

    const visitor = await prisma.analyticsVisitor.findFirst()
    expect(visitor?.userId).toBe(caller.publicId)
    expect(visitor?.userId).not.toBe(victim.publicId)
  })

  it('does nothing when the caller has no established visitor', async () => {
    const user = await createUser(`semvisitante${Date.now()}`)

    const response = await post('/analytics/identify')
      .set('Cookie', [CONSENT_GRANTED])
      .set('Authorization', `Bearer ${tokenFor(user.publicId)}`)
      .send({})

    expect(response.statusCode).toBe(204)
    expect(await prisma.analyticsVisitor.count()).toBe(0)
  })
})

describe('POST /analytics/consent/revoke', () => {
  it('clears all three cookies', async () => {
    const { jar } = await bootstrapSession()

    const response = await post('/analytics/consent/revoke').set('Cookie', jar).send({})

    expect(response.statusCode).toBe(204)

    const cleared = cookiesOf(response)
    expect(cleared.some((c) => c.startsWith(`${VISITOR_COOKIE}=`))).toBe(true)
    expect(cleared.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(true)
    expect(cleared.some((c) => c.startsWith(`${CONSENT_COOKIE}=`))).toBe(true)
  })

  it('ERASES the collected data, not merely stops collecting', async () => {
    const { jar } = await bootstrapSession()
    await post('/analytics/events')
      .set('Cookie', jar)
      .send({ events: [{ eventType: 'page_view', path: '/post' }] })

    expect(await prisma.analyticsEvent.count()).toBe(1)

    await post('/analytics/consent/revoke').set('Cookie', jar).send({})

    // §5.1: withdrawing consent that leaves 13 months of history in place is not
    // a withdrawal. Sessions and events go with the visitor via ON DELETE CASCADE.
    expect(await prisma.analyticsVisitor.count()).toBe(0)
    expect(await prisma.analyticsSession.count()).toBe(0)
    expect(await prisma.analyticsEvent.count()).toBe(0)
  })

  it('succeeds for a caller who was never tracked', async () => {
    const response = await post('/analytics/consent/revoke').send({})

    expect(response.statusCode).toBe(204)
  })

  it('needs no authentication', async () => {
    const { jar } = await bootstrapSession()

    // Requiring a login to withdraw consent would make withdrawal conditional on
    // handing over more identity than the tracking ever asked for.
    const response = await post('/analytics/consent/revoke').set('Cookie', jar).send({})

    expect(response.statusCode).not.toBe(401)
  })
})

describe('DELETE /analytics/me', () => {
  async function createUser(username: string) {
    return prisma.user.create({
      data: {
        name: 'Titular',
        username,
        email: `${username}@example.com`,
        cpf: username.slice(0, 11).padEnd(11, '0'),
        passwordHash: 'not-a-real-hash',
      },
    })
  }

  function tokenFor(publicId: string) {
    return app.jwt.sign({ sub: publicId, role: 'DEFAULT' })
  }

  it('refuses an unauthenticated call', async () => {
    const response = await request(app.server)
      .delete('/analytics/me')
      .set('X-Forwarded-For', createForwardedIp())
      .set(ANALYTICS_PROXY_HEADER, env.ANALYTICS_PROXY_SECRET)
      .send()

    expect(response.statusCode).toBe(401)
  })

  it('erases the caller’s own analytics record', async () => {
    const user = await createUser(`titular${Date.now()}`)
    const { jar } = await bootstrapSession()

    await post('/analytics/identify')
      .set('Cookie', jar)
      .set('Authorization', `Bearer ${tokenFor(user.publicId)}`)
      .send({})

    const response = await request(app.server)
      .delete('/analytics/me')
      .set('X-Forwarded-For', createForwardedIp())
      .set(ANALYTICS_PROXY_HEADER, env.ANALYTICS_PROXY_SECRET)
      .set('Cookie', jar)
      .set('Authorization', `Bearer ${tokenFor(user.publicId)}`)
      .send()

    expect(response.statusCode).toBe(204)
    expect(await prisma.analyticsVisitor.count()).toBe(0)
  })

  it('never erases another user’s record', async () => {
    const caller = await createUser(`chamador${Date.now()}`)
    const other = await createUser(`outro${Date.now()}`)

    const otherVisit = await bootstrapSession()
    await post('/analytics/identify')
      .set('Cookie', otherVisit.jar)
      .set('Authorization', `Bearer ${tokenFor(other.publicId)}`)
      .send({})

    await request(app.server)
      .delete('/analytics/me')
      .set('X-Forwarded-For', createForwardedIp())
      .set(ANALYTICS_PROXY_HEADER, env.ANALYTICS_PROXY_SECRET)
      .set('Authorization', `Bearer ${tokenFor(caller.publicId)}`)
      .send()

    // There is no parameter by which one account could reach another's data —
    // the scope is the verified JWT and nothing else.
    const survivor = await prisma.analyticsVisitor.findFirst()
    expect(survivor?.userId).toBe(other.publicId)
  })
})

describe('GET /analytics/visitors/:visitorId (ADMIN)', () => {
  async function createUser(username: string, role: 'ADMIN' | 'DEFAULT') {
    return prisma.user.create({
      data: {
        name: 'Operador',
        username,
        email: `${username}@example.com`,
        cpf: username.slice(0, 11).padEnd(11, '0'),
        passwordHash: 'not-a-real-hash',
        role,
      },
    })
  }

  function tokenFor(publicId: string, role: 'ADMIN' | 'DEFAULT') {
    return app.jwt.sign({ sub: publicId, role })
  }

  async function seedReadingHistory() {
    const { jar } = await bootstrapSession()

    await post('/analytics/events')
      .set('Cookie', jar)
      .send({
        events: [
          { eventType: 'page_view', path: '/post/um', title: 'Um' },
          { eventType: 'page_exit', path: '/post/um', durationMs: 45_000, scrollDepth: 80 },
        ],
      })

    const visitor = await prisma.analyticsVisitor.findFirst()

    return visitor!.visitorId
  }

  function adminGet(path: string, token: string) {
    return request(app.server)
      .get(path)
      .set('X-Forwarded-For', createForwardedIp())
      .set('Authorization', `Bearer ${token}`)
  }

  it('refuses an unauthenticated call', async () => {
    const response = await request(app.server)
      .get('/analytics/visitors/qualquer')
      .set('X-Forwarded-For', createForwardedIp())

    expect(response.statusCode).toBe(401)
  })

  it('refuses a non-ADMIN caller', async () => {
    const reader = await createUser(`leitor${Date.now()}`, 'DEFAULT')

    const response = await adminGet('/analytics/visitors/qualquer', tokenFor(reader.publicId, 'DEFAULT'))

    expect(response.statusCode).toBe(403)
  })

  /**
   * These routes sit OUTSIDE the X-Analytics-Proxy gate on purpose — a dashboard
   * call comes from an operator's browser, where CORS permits only Content-Type
   * and Authorization. Requiring the shared secret would mean shipping it to a
   * browser, publishing it in devtools and defeating the gate on the ingestion
   * routes it actually protects.
   */
  it('does not require the analytics proxy header', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')
    const visitorId = await seedReadingHistory()

    const response = await adminGet(`/analytics/visitors/${visitorId}`, tokenFor(admin.publicId, 'ADMIN'))

    expect(response.statusCode).toBe(200)
  })

  it('answers 404 for a visitor that does not exist', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')

    const response = await adminGet('/analytics/visitors/nao-existe', tokenFor(admin.publicId, 'ADMIN'))

    expect(response.statusCode).toBe(404)
  })

  it('returns the three sections §6 asks for', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')
    const visitorId = await seedReadingHistory()

    const response = await adminGet(`/analytics/visitors/${visitorId}`, tokenFor(admin.publicId, 'ADMIN'))

    expect(response.statusCode).toBe(200)
    expect(response.body.visitor.visitorId).toBe(visitorId)
    expect(response.body.visitor.sessionCount).toBe(1)
    expect(response.body.visits).toHaveLength(1)
  })

  it('reports pages actually read, with their measurements', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')
    const visitorId = await seedReadingHistory()

    const response = await adminGet(`/analytics/visitors/${visitorId}`, tokenFor(admin.publicId, 'ADMIN'))

    // Two events were sent; only the one carrying a duration is a "page read".
    expect(response.body.pagesRead).toHaveLength(1)
    expect(response.body.pagesRead[0]).toMatchObject({ path: '/post/um', durationMs: 45_000, scrollDepth: 80 })
  })

  it('never exposes the stored IP address', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')
    const visitorId = await seedReadingHistory()

    const response = await adminGet(`/analytics/visitors/${visitorId}`, tokenFor(admin.publicId, 'ADMIN'))

    expect(JSON.stringify(response.body)).not.toContain('ipAddress')
  })

  it('rejects a page size beyond the ceiling', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')
    const visitorId = await seedReadingHistory()

    const response = await adminGet(`/analytics/visitors/${visitorId}?limit=5000`, tokenFor(admin.publicId, 'ADMIN'))

    expect(response.statusCode).toBe(400)
  })

  it('finds a visitor by the account it is linked to', async () => {
    const admin = await createUser(`admin${Date.now()}`, 'ADMIN')
    const reader = await createUser(`vinculado${Date.now()}`, 'DEFAULT')
    const { jar } = await bootstrapSession()

    await post('/analytics/identify')
      .set('Cookie', jar)
      .set('Authorization', `Bearer ${tokenFor(reader.publicId, 'DEFAULT')}`)
      .send({})

    const response = await adminGet(`/analytics/visitors?userId=${reader.publicId}`, tokenFor(admin.publicId, 'ADMIN'))

    expect(response.statusCode).toBe(200)
    expect(response.body.visitors).toHaveLength(1)
    expect(response.body.visitors[0].userId).toBe(reader.publicId)
  })
})
