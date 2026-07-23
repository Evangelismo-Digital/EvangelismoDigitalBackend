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

describe('Analytics routes and plugin (e2e)', () => {
  beforeAll(async () => {
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  it('automatically sets visitor_id and session_id cookies on any request', async () => {
    const response = await request(app.server).get('/health')

    expect(response.headers['set-cookie']).toBeDefined()
    const cookies = response.headers['set-cookie'] as unknown as string[]

    const hasVisitorCookie = cookies.some((c) => c.startsWith('visitor_id='))
    const hasSessionCookie = cookies.some((c) => c.startsWith('session_id='))

    expect(hasVisitorCookie).toBe(true)
    expect(hasSessionCookie).toBe(true)
  })

  it('should accept custom events on POST /analytics/events and pass cookie values to the usecase', async () => {
    // First, let's hit /health to get the signed cookies
    const initialResponse = await request(app.server).get('/health')
    const cookies = initialResponse.headers['set-cookie'] as unknown as string[]

    // Retrieve the cookie values
    const visitorCookie = cookies.find((c) => c.startsWith('visitor_id='))
    const sessionCookie = cookies.find((c) => c.startsWith('session_id='))

    expect(visitorCookie).toBeDefined()
    expect(sessionCookie).toBeDefined()

    // Send the POST request with the cookies
    const response = await request(app.server)
      .post('/analytics/events')
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
