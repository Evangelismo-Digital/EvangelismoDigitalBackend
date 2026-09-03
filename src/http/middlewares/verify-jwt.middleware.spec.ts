import { describe, it, expect, vi } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifyJwt } from './verify-jwt.middleware'
import { AUTH_ERRORS } from 'messages/errors/auth'

function makeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return reply as unknown as FastifyReply & typeof reply
}

describe('verifyJwt middleware', () => {
  it('passes through silently when jwtVerify resolves', async () => {
    const request = { jwtVerify: vi.fn().mockResolvedValue({ sub: 'user-1' }) } as unknown as FastifyRequest
    const reply = makeReply()

    await verifyJwt(request, reply)

    expect(request.jwtVerify).toHaveBeenCalledOnce()
    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('responds 401 with the unauthorized message when jwtVerify rejects', async () => {
    const request = { jwtVerify: vi.fn().mockRejectedValue(new Error('bad token')) } as unknown as FastifyRequest
    const reply = makeReply()

    await verifyJwt(request, reply)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith({ message: AUTH_ERRORS.UNAUTHORIZED.message })
  })

  it('does not rethrow the verification error', async () => {
    const request = { jwtVerify: vi.fn().mockRejectedValue(new Error('bad token')) } as unknown as FastifyRequest
    const reply = makeReply()

    await expect(verifyJwt(request, reply)).resolves.not.toThrow()
  })
})
