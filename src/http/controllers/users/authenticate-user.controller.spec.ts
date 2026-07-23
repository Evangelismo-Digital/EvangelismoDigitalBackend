import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it, vi } from 'vitest'
import { authenticateUser } from './authenticate-user.controller'

const mockAuthenticateExecute = vi.fn()

vi.mock('@use-cases/factories/make-authenticate-user-use-case', () => ({
  makeAuthenticateUserUseCase: vi.fn(() => ({
    execute: mockAuthenticateExecute,
  })),
}))

describe('authenticateUser controller', () => {
  it('throws ZodError for invalid request bodies (caught by global error handler)', async () => {
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

    // With .parse(), invalid body throws a ZodError before the controller logic runs.
    // The global error-handler plugin catches ZodError and sends a 400 response.
    await expect(() => authenticateUser(request, reply)).rejects.toThrow()

    expect(mockAuthenticateExecute).not.toHaveBeenCalled()
  })
})
