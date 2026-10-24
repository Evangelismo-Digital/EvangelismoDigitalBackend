/**
 * Regression: `GET /users/search` leaked `passwordHash` and the internal `id`.
 *
 * What broke: the search controller sent the repository's `User` rows straight
 * to the client, skipping `UserPresenter` — which `GET /users` (list) already
 * used. Every search answered with each matched user's bcrypt hash and the
 * auto-increment primary key.
 *
 * Why it mattered: the route is ADMIN-only, but a hash is still an offline
 * cracking target the moment an admin token, a log of the response or a
 * browser cache is exposed, and the numeric id exposes table size and
 * enumeration order that `publicId` exists to hide.
 *
 * Defect: SEARCH-USERS-PRESENTER (found while documenting the API for manual
 * Insomnia testing, 2026-10-15).
 */
import type { FastifyReply } from 'fastify'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@prisma/client'

const mockExecute = vi.fn()

vi.mock('@modules/users/factories/make-search-users.service', () => ({
  makeSearchUsersUseCase: vi.fn(() => ({ execute: mockExecute })),
}))

vi.mock('@infra/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { searchUsersController } from './search-users.controller'
import { ok } from '@common/utils/result'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const updatedAt = new Date('2026-01-02T00:00:00.000Z')

function makeUser(overrides: Partial<User>): User {
  return {
    id: 127,
    publicId: '0197f9cb-e9dd-72f2-8bea-863124fbec4c',
    name: 'Admin User',
    username: 'Admin',
    email: 'admin@example.com',
    cpf: '111.111.111-11',
    passwordHash: '$2b$12$abcdefghijklmnopqrstuuMZ0kG7Qd0Hc9mVcO2bQ6f1n7y2xK6',
    role: 'ADMIN',
    createdAt,
    updatedAt,
    ...overrides,
  } as User
}

function makeRequest() {
  return { query: { query: 'a', page: 1 } } as any
}

function makeReply() {
  return { code: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() } as unknown as FastifyReply
}

function sentBody(reply: FastifyReply) {
  return vi.mocked(reply.send).mock.calls[0][0] as { users: Record<string, unknown>[] }
}

describe('GET /users/search — response must not leak credentials (regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not send passwordHash or the internal id for any matched user', async () => {
    mockExecute.mockResolvedValue(ok({ users: [makeUser({}), makeUser({ id: 128, publicId: 'other' })] }))
    const reply = makeReply()

    await searchUsersController(makeRequest(), reply)

    for (const user of sentBody(reply).users) {
      expect(user).not.toHaveProperty('passwordHash')
      expect(user).not.toHaveProperty('id')
    }
  })

  it('still answers 200 with every matched user and the presenter fields (counterweight)', async () => {
    mockExecute.mockResolvedValue(
      ok({ users: [makeUser({}), makeUser({ id: 128, publicId: 'second', name: 'Jane', role: 'DEFAULT' })] }),
    )
    const reply = makeReply()

    await searchUsersController(makeRequest(), reply)

    expect(reply.code).toHaveBeenCalledWith(200)
    expect(sentBody(reply)).toEqual({
      users: [
        {
          publicId: '0197f9cb-e9dd-72f2-8bea-863124fbec4c',
          name: 'Admin User',
          email: 'admin@example.com',
          cpf: '111.111.111-11',
          role: 'ADMIN',
          createdAt,
          updatedAt,
        },
        {
          publicId: 'second',
          name: 'Jane',
          email: 'admin@example.com',
          cpf: '111.111.111-11',
          role: 'DEFAULT',
          createdAt,
          updatedAt,
        },
      ],
    })
  })
})
