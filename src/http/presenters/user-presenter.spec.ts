import { describe, it, expect } from 'vitest'
import { User } from '@prisma/client'
import { UserPresenter } from './user-presenter'

const user = {
  id: 1,
  publicId: 'pub-1',
  name: 'Ana',
  email: 'ana@example.com',
  cpf: '12345678900',
  role: 'DEFAULT',
  password: 'hashed-secret',
  token: 'reset-token-hash',
  tokenExpiresAt: new Date('2026-01-05T00:00:00Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
} as unknown as User

describe('UserPresenter.toHTTP', () => {
  it('exposes only the public fields of a single user', () => {
    const result = UserPresenter.toHTTP(user)

    expect(result).toEqual({
      publicId: 'pub-1',
      name: 'Ana',
      email: 'ana@example.com',
      cpf: '12345678900',
      role: 'DEFAULT',
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  })

  it('never leaks the password or reset-token fields', () => {
    const result = UserPresenter.toHTTP(user)

    expect(result).not.toHaveProperty('password')
    expect(result).not.toHaveProperty('token')
    expect(result).not.toHaveProperty('tokenExpiresAt')
    expect(result).not.toHaveProperty('id')
  })

  it('maps an array of users preserving order', () => {
    const second = { ...user, publicId: 'pub-2', name: 'Bruno' } as User
    const result = UserPresenter.toHTTP([user, second])

    expect(result).toHaveLength(2)
    expect(result.map((u) => u.publicId)).toEqual(['pub-1', 'pub-2'])
    expect(result[1]).not.toHaveProperty('password')
  })

  it('returns an empty array for an empty input', () => {
    expect(UserPresenter.toHTTP([])).toEqual([])
  })
})
