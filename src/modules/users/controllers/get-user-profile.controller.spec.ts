import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import { ok, err } from '@common/utils/result'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { HTTP_STATUS } from '@common/constants/http-status'
import { USER_ERRORS } from '@common/messages/errors/users'

const executeMock = vi.fn()

vi.mock('@modules/users/factories/make-get-user-profile.service', () => ({
  makeGetUserProfileUseCase: () => ({ execute: executeMock }),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { getUserProfile, getUserByPublicId } from './get-user-profile.controller'

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

describe('get-user-profile.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getUserProfile returns 200 with presented user when profile is found', async () => {
    const user = makeUser()
    executeMock.mockResolvedValue(ok({ user }))
    const { reply, code, send } = makeReply()

    await getUserProfile({ user: { sub: user.publicId } } as unknown as FastifyRequest, reply)

    expect(executeMock).toHaveBeenCalledWith({ publicId: user.publicId })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.OK)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: user.publicId,
        name: user.name,
        email: user.email,
      }),
    )
  })

  it('getUserProfile delegates to HttpErrorMapper when use case fails', async () => {
    executeMock.mockResolvedValue(err(new UserNotFoundError()))
    const { reply, code, send } = makeReply()

    await getUserProfile({ user: { sub: '01950000-0000-7000-8000-000000000001' } } as unknown as FastifyRequest, reply)

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: USER_ERRORS.NOT_FOUND.message }))
  })

  it('getUserByPublicId returns 200 with presented user when user is found', async () => {
    const user = makeUser()
    executeMock.mockResolvedValue(ok({ user }))
    const { reply, code, send } = makeReply()

    await getUserByPublicId(
      { params: { publicId: user.publicId } } as unknown as Parameters<typeof getUserByPublicId>[0],
      reply,
    )

    expect(executeMock).toHaveBeenCalledWith({ publicId: user.publicId })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.OK)
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: user.publicId,
        email: user.email,
      }),
    )
  })

  it('getUserByPublicId delegates to HttpErrorMapper when use case fails', async () => {
    executeMock.mockResolvedValue(err(new UserNotFoundError()))
    const { reply, code, send } = makeReply()

    await getUserByPublicId(
      { params: { publicId: '01950000-0000-7000-8000-000000000001' } } as unknown as Parameters<
        typeof getUserByPublicId
      >[0],
      reply,
    )

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: USER_ERRORS.NOT_FOUND.message }))
  })
})
