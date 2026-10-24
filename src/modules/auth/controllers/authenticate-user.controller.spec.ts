import type { FastifyReply } from 'fastify'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()

vi.mock('@modules/auth/factories/make-authenticate-user.service', () => ({
  makeAuthenticateUserUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { authenticateUser } from './authenticate-user.controller'
import { ok, err } from '@common/utils/result'
import { InvalidCredentialsError } from '@modules/auth/errors/invalid-credentials-error'
import { UserRole } from '@modules/users/repositories/users-repository.interface'

const fakeUser = {
  id: 1,
  publicId: '018f3a84-6a12-7100-8000-000000000001',
  name: 'João Silva',
  email: 'joao@example.com',
  cpf: '12345678901',
  username: 'joaosilva',
  passwordHash: 'hashed-secret',
  role: UserRole.DEFAULT,
  loginAttempts: 0,
  lastLoginAt: new Date(),
  passwordChangedAt: null,
  token: null,
  tokenExpiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

function makeReply() {
  return {
    jwtSign: vi.fn().mockResolvedValue('signed-jwt-token'),
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply
}

describe('authenticateUser controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('signs a JWT and returns 200 with sanitized user on success', async () => {
    mockExecute.mockResolvedValueOnce(ok({ user: fakeUser }))
    const reply = makeReply()
    const request = {
      body: { login: 'joao@example.com', password: 'Password123!' },
      ip: '203.0.113.10',
      socket: { remotePort: 54321 },
      headers: { 'user-agent': 'Vitest/1.0', origin: 'https://evangelismodigital.com' },
    } as never

    await authenticateUser(request, reply)

    expect(mockExecute).toHaveBeenCalledWith({
      login: 'joao@example.com',
      password: 'Password123!',
      auditContext: {
        ipAddress: '203.0.113.10',
        remotePort: '54321',
        userAgent: 'Vitest/1.0',
        origin: 'https://evangelismodigital.com',
      },
    })
    expect(reply.jwtSign).toHaveBeenCalledWith({ sub: fakeUser.publicId, role: fakeUser.role }, { expiresIn: '1d' })
    expect(reply.code).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'signed-jwt-token',
        user: expect.objectContaining({ publicId: fakeUser.publicId, email: fakeUser.email }),
      }),
    )
  })

  it('normalizes missing socket remotePort and non-string headers to null and maps domain errors', async () => {
    mockExecute.mockResolvedValueOnce(err(new InvalidCredentialsError()))
    const reply = makeReply()
    const request = {
      body: { login: 'joao@example.com', password: 'wrong' },
      ip: '203.0.113.10',
      socket: {},
      headers: {},
    } as never

    await authenticateUser(request, reply)

    expect(mockExecute).toHaveBeenCalledWith({
      login: 'joao@example.com',
      password: 'wrong',
      auditContext: {
        ipAddress: '203.0.113.10',
        remotePort: null,
        userAgent: null,
        origin: null,
      },
    })
    expect(reply.code).toHaveBeenCalledWith(401)
  })
})
