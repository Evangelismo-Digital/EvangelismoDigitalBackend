import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import { ok, err } from '@common/utils/result'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { HTTP_STATUS } from '@common/constants/http-status'

const executeMock = vi.fn()

vi.mock('@modules/users/factories/make-list-users.service', () => ({
  makeListUsersUseCase: () => ({ execute: executeMock }),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { listUsers } from './list-users.controller'

function makeUser(): User {
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
    role: 'DEFAULT',
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

describe('list-users.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with presented users list on success', async () => {
    const user = makeUser()
    executeMock.mockResolvedValue(ok({ users: [user] }))
    const { reply, code, send } = makeReply()

    await listUsers({} as FastifyRequest, reply)

    expect(executeMock).toHaveBeenCalledOnce()
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.OK)
    expect(send).toHaveBeenCalledWith({
      users: [expect.objectContaining({ publicId: user.publicId, email: user.email })],
    })
  })

  it('delegates to HttpErrorMapper when use case fails', async () => {
    executeMock.mockResolvedValue(err(new UserNotFoundError()))
    const { reply, code } = makeReply()

    await listUsers({} as FastifyRequest, reply)

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
  })
})
