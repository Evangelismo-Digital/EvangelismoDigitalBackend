import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { authenticateUser } from './authenticate-user.controller'

const INVALID_REQUEST_STATUS = 'INVALID_REQUEST' as const

const mockAuthenticateExecute = vi.fn()
const mockAuditExecute = vi.fn()

vi.mock('@use-cases/factories/make-authenticate-user-use-case', () => ({
  makeAuthenticateUserUseCase: vi.fn(() => ({
    execute: mockAuthenticateExecute,
  })),
}))

vi.mock('@use-cases/factories/make-authentication-audit-use-case', () => ({
  makeAuthenticationAuditUseCase: vi.fn(() => ({
    execute: mockAuditExecute,
  })),
}))

describe('authenticateUser controller', () => {
  it('records invalid request bodies', async () => {
    const request = {
      body: { login: 123, password: '1234' },
      ip: '203.0.113.10',
      socket: { remotePort: 4321 },
      headers: {
        'user-agent': 'vitest',
        origin: 'http://localhost',
      },
    } as any

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      jwtSign: vi.fn(),
    } as any

    await authenticateUser(request, reply)

    expect(mockAuthenticateExecute).not.toHaveBeenCalled()
    expect(mockAuditExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        status: INVALID_REQUEST_STATUS,
        ipAddress: '203.0.113.10',
        remotePort: '4321',
        userAgent: 'vitest',
        origin: 'http://localhost',
      }),
    )
    expect(reply.status).toHaveBeenCalledWith(400)
    expect(reply.send).toHaveBeenCalled()
  })
})
