import request from 'supertest'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app } from 'app'
import { prisma } from '@infra/database/prisma'

/**
 * A tag unique to this run, so the search can only ever match rows this file
 * created. The `e2e` files share the `public` schema and run in parallel; a
 * `TRUNCATE users` here deadlocked against the analytics suite's own truncate.
 */
function uniqueTag() {
  return `srch${randomUUID().replaceAll('-', '').slice(0, 12)}`
}

async function createUser(username: string, role: 'ADMIN' | 'DEFAULT') {
  return prisma.user.create({
    data: {
      name: `Usuario ${username}`,
      username,
      email: `${username}@example.com`,
      cpf: randomUUID().replaceAll(/\D/g, '').padEnd(11, '0').slice(0, 11),
      passwordHash: 'not-a-real-hash',
      role,
    },
  })
}

function search(token: string, query: string) {
  return request(app.server).get('/users/search').query({ query, page: 1 }).set('Authorization', `Bearer ${token}`)
}

beforeAll(async () => {
  await app.ready()
})

afterAll(async () => {
  await app.close()
})

describe('GET /users/search (ADMIN)', () => {
  it('serialises matches through the presenter, without passwordHash or the internal id', async () => {
    const tag = uniqueTag()
    const admin = await createUser(`${uniqueTag()}admin`, 'ADMIN')
    const target = await createUser(tag, 'DEFAULT')

    const response = await search(app.jwt.sign({ sub: admin.publicId, role: 'ADMIN' }), tag)

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      users: [
        {
          publicId: target.publicId,
          name: target.name,
          email: target.email,
          cpf: target.cpf,
          role: 'DEFAULT',
          createdAt: target.createdAt.toISOString(),
          updatedAt: target.updatedAt.toISOString(),
        },
      ],
    })
  })

  it('refuses a non-ADMIN caller', async () => {
    const tag = uniqueTag()
    const user = await createUser(tag, 'DEFAULT')

    const response = await search(app.jwt.sign({ sub: user.publicId, role: 'DEFAULT' }), tag)

    expect(response.status).toBe(403)
  })
})
