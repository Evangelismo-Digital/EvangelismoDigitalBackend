import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { ok } from 'core/shared/result'

const { mockExecute, mockMakeTrackAnalyticsUseCase } = vi.hoisted(() => {
  const mockExecute = vi.fn().mockResolvedValue({ success: true, value: undefined })
  const mockMakeTrackAnalyticsUseCase = vi.fn(() => ({
    execute: mockExecute,
  }))
  return { mockExecute, mockMakeTrackAnalyticsUseCase }
})

vi.mock('@use-cases/factories/make-track-analytics-use-case', () => ({
  makeTrackAnalyticsUseCase: mockMakeTrackAnalyticsUseCase,
}))

import { app } from 'app'

/**
 * A distinct source IP per request.
 *
 * Hygiene, not a proven fix. This file shares Redis with every other suite and,
 * without a forwarded address, presents as the same client as all of them — so
 * its 201 assertions depend on how much of the rate-limit bucket somebody else
 * has already spent. Removing that coupling costs nothing.
 *
 * It is NOT the explanation for the one failure seen here (a single non-201 on
 * a run that followed the acceptance suite): pinning every request to one
 * address and deliberately spending 305 of the 300-per-minute global bucket
 * before the test did not reproduce it, and the failure has not recurred in
 * four subsequent runs. Left documented rather than explained away.
 *
 * Same pool as churches-rate-limit.e2e.spec.ts: addresses issued sequentially
 * from a per-process random offset (so two draws in one run never collide) out
 * of 198.18.0.0/15, IANA's benchmarking range — public enough that `trustProxy`
 * keeps it rather than falling back to the socket address.
 */
const ipOffset = Math.floor(Math.random() * 65_536)
let ipsIssued = 0

function createForwardedIp() {
  const host = (ipOffset + ipsIssued++) % 65_536
  return `198.18.${host >> 8}.${host & 0xff}`
}

describe('Analytics routes and plugin (e2e)', () => {
  beforeAll(async () => {
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('automatically sets visitor_id and session_id cookies on any request', async () => {
    const response = await request(app.server).get('/health').set('X-Forwarded-For', createForwardedIp())

    expect(response.headers['set-cookie']).toBeDefined()
    const cookies = response.headers['set-cookie'] as unknown as string[]

    const hasVisitorCookie = cookies.some((c) => c.startsWith('visitor_id='))
    const hasSessionCookie = cookies.some((c) => c.startsWith('session_id='))

    expect(hasVisitorCookie).toBe(true)
    expect(hasSessionCookie).toBe(true)
  })

  it('should accept custom events on POST /analytics/events and pass cookie values to the usecase', async () => {
    // First, let's hit /health to get the signed cookies
    const initialResponse = await request(app.server).get('/health').set('X-Forwarded-For', createForwardedIp())
    const cookies = initialResponse.headers['set-cookie'] as unknown as string[]

    // Retrieve the cookie values
    const visitorCookie = cookies.find((c) => c.startsWith('visitor_id='))
    const sessionCookie = cookies.find((c) => c.startsWith('session_id='))

    expect(visitorCookie).toBeDefined()
    expect(sessionCookie).toBeDefined()

    // Send the POST request with the cookies
    const response = await request(app.server)
      .post('/analytics/events')
      .set('X-Forwarded-For', createForwardedIp())
      .set('Cookie', [visitorCookie!, sessionCookie!])
      .send({
        eventType: 'click',
        path: '/dashboard',
        payload: { buttonId: 'submit-form' },
      })

    expect(response.statusCode).toBe(201)
    expect(mockMakeTrackAnalyticsUseCase).toHaveBeenCalled()
    expect(mockExecute).toHaveBeenCalled()

    // Check that it extracted the unsigned visitor_id and session_id
    const mockCallArgs = mockExecute.mock.calls[0][0]
    expect(mockCallArgs.eventType).toBe('click')
    expect(mockCallArgs.path).toBe('/dashboard')
    expect(mockCallArgs.payload).toEqual({ buttonId: 'submit-form' })
    expect(mockCallArgs.visitorId).toBeDefined()
    expect(mockCallArgs.sessionId).toBeDefined()
  })
})
