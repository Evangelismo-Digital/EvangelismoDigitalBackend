import { describe, it, expect, vi } from 'vitest'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { UserRole } from '@prisma/client'
import { verifyUserRole } from './verify-user-role.middleware'
import { AUTH_ERRORS } from 'messages/errors/auth'

function makeReply() {
  const reply = {
    code: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  }
  return reply as unknown as FastifyReply & typeof reply
}

function makeRequest(role: unknown) {
  return { user: { role } } as unknown as FastifyRequest
}

describe('verifyUserRole middleware', () => {
  it('returns a middleware function (factory pattern)', () => {
    expect(typeof verifyUserRole([UserRole.ADMIN])).toBe('function')
  })

  it('allows the request when the user role is in the allowed list', async () => {
    const reply = makeReply()

    await verifyUserRole([UserRole.ADMIN, UserRole.DEFAULT])(makeRequest(UserRole.DEFAULT), reply)

    expect(reply.code).not.toHaveBeenCalled()
    expect(reply.send).not.toHaveBeenCalled()
  })

  it('responds 401 when the request carries no role', async () => {
    const reply = makeReply()

    await verifyUserRole([UserRole.ADMIN])(makeRequest(undefined), reply)

    expect(reply.code).toHaveBeenCalledWith(401)
    expect(reply.send).toHaveBeenCalledWith({ message: AUTH_ERRORS.UNAUTHORIZED.message })
  })

  it('responds 403 when the role is present but not allowed', async () => {
    const reply = makeReply()

    await verifyUserRole([UserRole.ADMIN])(makeRequest(UserRole.DEFAULT), reply)

    expect(reply.code).toHaveBeenCalledWith(403)
    expect(reply.send).toHaveBeenCalledWith({ message: AUTH_ERRORS.FORBIDDEN.message })
  })

  it('rejects every role when the allowed list is empty', async () => {
    const reply = makeReply()

    await verifyUserRole([])(makeRequest(UserRole.ADMIN), reply)

    expect(reply.code).toHaveBeenCalledWith(403)
  })
})
