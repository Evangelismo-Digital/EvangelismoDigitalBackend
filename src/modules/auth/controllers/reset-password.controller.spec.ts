import type { FastifyReply } from 'fastify'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()

vi.mock('@modules/auth/factories/make-reset-password.service', () => ({
  makeResetPasswordUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { resetPassword } from './reset-password.controller'
import { ok, err } from '@common/utils/result'
import { AUTH_CONSTANTS } from '@common/messages/constants/auth/auth'
import { InvalidTokenError } from '@modules/auth/errors/invalid-token-error'

function makeReply() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply
}

describe('resetPassword controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 with success message when password reset succeeds', async () => {
    mockExecute.mockResolvedValueOnce(ok({ user: { publicId: 'user-1' } }))
    const reply = makeReply()

    await resetPassword({ body: { password: 'NewPassword1!', token: 'tok-123' } } as never, reply)

    expect(mockExecute).toHaveBeenCalledWith({ password: 'NewPassword1!', token: 'tok-123' })
    expect(reply.code).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith({ message: AUTH_CONSTANTS.PASSWORD_CHANGED_SUCCESS })
  })

  it('maps domain error when token is invalid', async () => {
    mockExecute.mockResolvedValueOnce(err(new InvalidTokenError()))
    const reply = makeReply()

    await resetPassword({ body: { password: 'NewPassword1!', token: 'bad' } } as never, reply)

    expect(reply.code).toHaveBeenCalledWith(401)
  })
})
