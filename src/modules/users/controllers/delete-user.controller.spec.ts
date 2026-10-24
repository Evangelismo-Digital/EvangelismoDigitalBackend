import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ok, err } from '@common/utils/result'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { HTTP_STATUS } from '@common/constants/http-status'
import { USER_ERRORS } from '@common/messages/errors/users'

const executeMock = vi.fn()

vi.mock('@modules/users/factories/make-delete-user.service', () => ({
  makeDeleteUserUseCase: () => ({ execute: executeMock }),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

import { deleteUser, deleteUserByPublicId } from './delete-user.controller'

function makeReply() {
  const send = vi.fn()
  const code = vi.fn(() => ({ send }))
  return { reply: { code, send } as unknown as FastifyReply, code, send }
}

describe('delete-user.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deleteUser returns 204 when deletion succeeds', async () => {
    executeMock.mockResolvedValue(ok(undefined))
    const { reply, code, send } = makeReply()

    await deleteUser({ user: { sub: '01950000-0000-7000-8000-000000000001' } } as unknown as FastifyRequest, reply)

    expect(executeMock).toHaveBeenCalledWith({ publicId: '01950000-0000-7000-8000-000000000001' })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT)
    expect(send).toHaveBeenCalled()
  })

  it('deleteUser delegates to HttpErrorMapper when deletion fails', async () => {
    executeMock.mockResolvedValue(err(new UserNotFoundError()))
    const { reply, code, send } = makeReply()

    await deleteUser({ user: { sub: '01950000-0000-7000-8000-000000000001' } } as unknown as FastifyRequest, reply)

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: USER_ERRORS.NOT_FOUND.message }))
  })

  it('deleteUserByPublicId returns 204 when deletion succeeds', async () => {
    executeMock.mockResolvedValue(ok(undefined))
    const { reply, code, send } = makeReply()

    await deleteUserByPublicId(
      { params: { publicId: '01950000-0000-7000-8000-000000000001' } } as unknown as Parameters<
        typeof deleteUserByPublicId
      >[0],
      reply,
    )

    expect(executeMock).toHaveBeenCalledWith({ publicId: '01950000-0000-7000-8000-000000000001' })
    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NO_CONTENT)
    expect(send).toHaveBeenCalled()
  })

  it('deleteUserByPublicId delegates to HttpErrorMapper when deletion fails', async () => {
    executeMock.mockResolvedValue(err(new UserNotFoundError()))
    const { reply, code, send } = makeReply()

    await deleteUserByPublicId(
      { params: { publicId: '01950000-0000-7000-8000-000000000001' } } as unknown as Parameters<
        typeof deleteUserByPublicId
      >[0],
      reply,
    )

    expect(code).toHaveBeenCalledWith(HTTP_STATUS.NOT_FOUND)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: USER_ERRORS.NOT_FOUND.message }))
  })
})
