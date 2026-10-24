import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyReply } from 'fastify'
import type { User } from '@prisma/client'
import { ok, err } from '@common/utils/result'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { HTTP_STATUS } from '@common/constants/http-status'
import { AUTH_ERRORS } from '@common/messages/errors/auth'
import { USER_ERRORS } from '@common/messages/errors/users'

const executeMock = vi.fn()

vi.mock('@modules/users/factories/make-update-user.service', () => ({
  makeUpdateUserUseCase: () => ({ execute: executeMock }),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { updateUser } from './update-user.controller'

function makeUser(): User {
  return {
    id: 1,
    publicId: '01950000-0000-7000-8000-000000000001',
    name: 'Updated Name',
    email: 'updated@example.com',
    username: 'updateduser',
    cpf: '12345678901',
    passwordHash: 'hashed',
    loginAttempts: 0,
    lastLogin: null,
    role: 'DEFAULT',
    token: null,
    tokenExpiresAt: null,
    passwordChangedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
  }
}

function makeReply() {
  const send = vi.fn()
  const code = vi.fn(() => ({ send }))
  return { reply: { code, send } as unknown as FastifyReply, code, send }
}

describe('update-user.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with updated user when publicId is present on request.user', async () => {
    const user = makeUser()
    executeMock.mockResolvedValue(ok({ user }))
    const { reply, code, send } = makeReply()

    await updateUser(
      {
        user: { publicId: user.publicId },
        body: { name: user.name, email: user.email, username: user.username },
      } as unknown as Parameters<typeof updateUser>[0],
      reply,
    )

    expect(executeMock).toHaveBeenCalledWith({
      publicId: user.publicId,
      name: user.name,
      email: user.email,
      username: user.username,
    })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.OK)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ publicId: user.publicId, name: user.name }))
  })

  it('falls back to request.user.sub when publicId claim is absent', async () => {
    const user = makeUser()
    executeMock.mockResolvedValue(ok({ user }))
    const { reply, code } = makeReply()

    await updateUser(
      {
        user: { sub: user.publicId },
        body: { name: user.name },
      } as unknown as Parameters<typeof updateUser>[0],
      reply,
    )

    expect(executeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        publicId: user.publicId,
        name: user.name,
      }),
    )
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.OK)
  })

  it('returns 401 when neither publicId nor sub is present on request.user', async () => {
    const { reply, code, send } = makeReply()

    await updateUser(
      {
        user: {},
        body: { name: 'Any' },
      } as unknown as Parameters<typeof updateUser>[0],
      reply,
    )

    expect(executeMock).not.toHaveBeenCalled()
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.UNAUTHORIZED)
    expect(send).toHaveBeenCalledWith({ message: AUTH_ERRORS.UNAUTHORIZED.message })
  })

  it('delegates to HttpErrorMapper when use case fails', async () => {
    executeMock.mockResolvedValue(err(new UserNotFoundError()))
    const { reply, code, send } = makeReply()

    await updateUser(
      {
        user: { sub: '01950000-0000-7000-8000-000000000001' },
        body: { name: 'Any' },
      } as unknown as Parameters<typeof updateUser>[0],
      reply,
    )

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: USER_ERRORS.NOT_FOUND.message }))
  })
})
