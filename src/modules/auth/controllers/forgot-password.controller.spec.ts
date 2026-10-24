import type { FastifyReply } from 'fastify'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const mockExecute = vi.fn()
const mockEnqueueOutboxDispatch = vi.fn()

vi.mock('@modules/auth/factories/make-forgot-password.service', () => ({
  makeForgotPasswordUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@infra/outbox/queue/outbox-dispatch-queue', () => ({
  enqueueOutboxDispatch: (...args: unknown[]) => mockEnqueueOutboxDispatch(...args),
}))

import { forgotPassword } from './forgot-password.controller'
import { ok, err } from '@common/utils/result'
import { EMAIL_CONSTANTS } from '@common/messages/constants/email/email'
import { InvalidPasswordResetPayloadError } from '@modules/auth/errors/invalid-password-reset-payload-error'

function makeReply() {
  return {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  } as unknown as FastifyReply
}

describe('forgotPassword controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns generic 200 immediately when email is empty', async () => {
    const reply = makeReply()

    await forgotPassword({ body: { email: '' } } as never, reply)

    expect(mockExecute).not.toHaveBeenCalled()
    expect(reply.code).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE })
  })

  it('enqueues outbox event when present and returns generic 200', async () => {
    const outboxEvent = { publicId: 'evt-1' }
    mockExecute.mockResolvedValueOnce(ok({ outboxEvent }))
    const reply = makeReply()

    await forgotPassword({ body: { email: 'user@example.com' } } as never, reply)

    expect(mockExecute).toHaveBeenCalledWith({ email: 'user@example.com' })
    expect(mockEnqueueOutboxDispatch).toHaveBeenCalledWith(outboxEvent)
    expect(reply.code).toHaveBeenCalledWith(200)
    expect(reply.send).toHaveBeenCalledWith({ message: EMAIL_CONSTANTS.PASSWORD_RESET_GENERIC_MESSAGE })
  })

  it('does not enqueue when outboxEvent is null and maps domain errors on failure', async () => {
    mockExecute.mockResolvedValueOnce(ok({ outboxEvent: null }))
    const reply = makeReply()

    await forgotPassword({ body: { email: 'unknown@example.com' } } as never, reply)
    expect(mockEnqueueOutboxDispatch).not.toHaveBeenCalled()

    mockExecute.mockResolvedValueOnce(err(new InvalidPasswordResetPayloadError()))
    const errReply = makeReply()
    await forgotPassword({ body: { email: 'bad@example.com' } } as never, errReply)
    expect(errReply.code).toHaveBeenCalledWith(400)
  })
})
