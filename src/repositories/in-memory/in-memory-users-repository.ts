import { User } from '@prisma/client'
import {
  CreateUser,
  FindByToken,
  UserPasswordUpdateInput,
  UsersRepository,
  UserWhereUniqueInput,
} from 'core/contracts/repository/users-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'

export class InMemoryUsersRepository implements UsersRepository {
  public items: User[] = []

  async findByToken(data: FindByToken): Promise<Result<User | null, AppError>> {
    const user = this.items.find((item) => item.token === data.token)

    return ok(user ?? null)
  }

  async findBy(where: UserWhereUniqueInput): Promise<Result<User | null, AppError>> {
    const user = this.items.find((item) => matchesAnyLookupField(item, where))

    return ok(user ?? null)
  }

  async search(query: string, page: number): Promise<Result<User[], AppError>> {
    const users = this.items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(query.toLowerCase()) ||
          item.email.toLowerCase().includes(query.toLowerCase()),
      )
      .slice((page - 1) * 20, page * 20)

    return ok(users)
  }

  async create(data: CreateUser): Promise<Result<User, AppError>> {
    const user = buildUser(data, this.items.length + 1)

    this.items.push(user)

    return ok(user)
  }

  async list(): Promise<Result<User[], AppError>> {
    return ok(this.items)
  }

  async delete(publicId: string): Promise<Result<User, AppError>> {
    const userIndex = this.items.findIndex((item) => item.publicId === publicId)
    if (userIndex === -1) {
      return err(new UserNotFoundError())
    }
    const [deletedUser] = this.items.splice(userIndex, 1)
    return ok(deletedUser)
  }

  async update(
    publicId: string,
    data: { name?: string; email?: string; username?: string },
  ): Promise<Result<User, AppError>> {
    const userIndex = this.items.findIndex((item) => item.publicId === publicId)
    if (userIndex === -1) {
      return err(new UserNotFoundError())
    }
    const existingUser = this.items[userIndex]
    const updatedUser = {
      ...existingUser,
      ...data,
      updatedAt: new Date(),
    }
    this.items[userIndex] = updatedUser
    return ok(updatedUser)
  }

  async updatePassword(publicId: string, data: UserPasswordUpdateInput): Promise<Result<User, AppError>> {
    const userIndex = this.items.findIndex((item) => item.publicId === publicId)
    if (userIndex === -1) {
      return err(new UserNotFoundError())
    }
    const existingUser = this.items[userIndex]
    const updatedUser = {
      ...existingUser,
      ...data,
    }
    this.items[userIndex] = updatedUser
    return ok(updatedUser)
  }
}

/**
 * Matches the Prisma repository's OR semantics: any single supplied field that
 * matches identifies the user. Listed once so the double and production cannot
 * disagree about which columns are unique.
 */
const USER_LOOKUP_FIELDS = ['id', 'publicId', 'email', 'username', 'cpf'] as const

function matchesAnyLookupField(item: User, where: UserWhereUniqueInput): boolean {
  return USER_LOOKUP_FIELDS.some((field) => where[field] !== undefined && item[field] === where[field])
}

type SeedUser = {
  publicId?: string
  name: string
  email: string
  username: string
  passwordHash: string
  cpf: string
  loginAttempts?: number
  lastLogin?: Date | string | null
  role?: 'DEFAULT' | 'ADMIN'
  tokenExpiresAt?: Date | string | null
  passwordChangedAt?: Date | string | null
}

/** Optional dates arrive as strings from fixtures, so each is normalised once. */
function toDate(value: Date | string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

function buildUser(data: CreateUser, id: number): User {
  const seed = data as unknown as SeedUser
  const now = new Date()

  return {
    id,
    publicId: seed.publicId || crypto.randomUUID(),
    name: seed.name,
    email: seed.email,
    username: seed.username,
    passwordHash: seed.passwordHash,
    cpf: seed.cpf,
    loginAttempts: seed.loginAttempts ?? 0,
    lastLogin: toDate(seed.lastLogin),
    role: seed.role ?? 'DEFAULT',
    token: null,
    tokenExpiresAt: toDate(seed.tokenExpiresAt),
    createdAt: now,
    updatedAt: now,
    passwordChangedAt: toDate(seed.passwordChangedAt),
  }
}
