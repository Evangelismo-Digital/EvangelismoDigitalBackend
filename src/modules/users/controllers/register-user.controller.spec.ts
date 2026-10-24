import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyReply } from 'fastify'
import type { User } from '@prisma/client'
import { ok, err } from '@common/utils/result'
import { UserAlreadyExistsError } from '@modules/users/errors/user-already-exists-error'
import { UserRole } from '@modules/users/repositories/users-repository.interface'
import { HTTP_STATUS } from '@common/constants/http-status'

const executeMock = vi.fn()

vi.mock('@modules/users/factories/make-register-user.service', () => ({
  makeRegisterUserUseCase: () => ({ execute: executeMock }),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { register, registerAdmin } from './register-user.controller'

function makeUser(role: 'DEFAULT' | 'ADMIN' = 'DEFAULT'): User {
  return {
    id: 1,
    publicId: '01950000-0000-7000-8000-000000000001',
    name: 'Test User',
    email: 'test@example.com',
    username: 'testuser',
    cpf: '12345678901',
    passwordHash: 'hashed',
    loginAttempts: 0,
    lastLogin: null,
    role,
    token: null,
    tokenExpiresAt: null,
    passwordChangedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  }
}

function makeReply() {
  const send = vi.fn()
  const code = vi.fn(() => ({ send }))
  return { reply: { code, send } as unknown as FastifyReply, code, send }
}

const body = {
  name: 'Test User',
  email: 'test@example.com',
  cpf: '12345678901',
  username: 'testuser',
  password: 'StrongPassword1!',
}

describe('register-user.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('register returns 201 with presented DEFAULT user on success', async () => {
    const user = makeUser('DEFAULT')
    executeMock.mockResolvedValue(ok({ user }))
    const { reply, code, send } = makeReply()

    await register({ body } as unknown as Parameters<typeof register>[0], reply)

    expect(executeMock).toHaveBeenCalledWith({
      ...body,
      role: UserRole.DEFAULT,
    })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.CREATED)
    expect(send).toHaveBeenCalledWith({
      user: expect.objectContaining({ publicId: user.publicId, role: 'DEFAULT' }),
    })
  })

  it('register delegates to HttpErrorMapper when user already exists', async () => {
    executeMock.mockResolvedValue(err(new UserAlreadyExistsError()))
    const { reply, code } = makeReply()

    await register({ body } as unknown as Parameters<typeof register>[0], reply)

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.CONFLICT)
  })

  it('registerAdmin returns 201 with presented ADMIN user on success', async () => {
    const user = makeUser('ADMIN')
    executeMock.mockResolvedValue(ok({ user }))
    const { reply, code, send } = makeReply()

    await registerAdmin({ body } as unknown as Parameters<typeof registerAdmin>[0], reply)

    expect(executeMock).toHaveBeenCalledWith({
      ...body,
      role: UserRole.ADMIN,
    })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.CREATED)
    expect(send).toHaveBeenCalledWith({
      user: expect.objectContaining({ publicId: user.publicId, role: 'ADMIN' }),
    })
  })

  it('registerAdmin delegates to HttpErrorMapper when user already exists', async () => {
    executeMock.mockResolvedValue(err(new UserAlreadyExistsError()))
    const { reply, code } = makeReply()

    await registerAdmin({ body } as unknown as Parameters<typeof registerAdmin>[0], reply)

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.CONFLICT)
  })
})
