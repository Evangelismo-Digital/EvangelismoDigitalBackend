import { User } from '@prisma/client'
import {
  CreateUser,
  FindByToken,
  UserPasswordUpdateInput,
  UsersRepository,
  UserWhereUniqueInput,
} from 'core/contracts/repository/users-repository.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'

export class InMemoryUsersRepository implements UsersRepository {
  public items: User[] = []

  async findByToken(data: FindByToken): Promise<Result<User | null, AppError>> {
    const user = this.items.find((item) => item.token === data.token)

    return ok(user ?? null)
  }

  async findBy(where: UserWhereUniqueInput): Promise<Result<User | null, AppError>> {
    const user = this.items.find(
      (item) =>
        (where.id !== undefined && item.id === where.id) ||
        (where.publicId !== undefined && item.publicId === where.publicId) ||
        (where.email !== undefined && item.email === where.email) ||
        (where.username !== undefined && item.username === where.username) ||
        (where.cpf !== undefined && item.cpf === where.cpf),
    )

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
    const now = new Date()

    const userData = data as unknown as {
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

    const user: User = {
      id: this.items.length + 1,
      publicId: userData.publicId || crypto.randomUUID(),
      name: userData.name,
      email: userData.email,
      username: userData.username,
      passwordHash: userData.passwordHash,
      cpf: userData.cpf,
      loginAttempts: userData.loginAttempts ?? 0,
      lastLogin: userData.lastLogin ? new Date(userData.lastLogin as string | Date) : null,
      role: (userData.role as 'DEFAULT' | 'ADMIN') ?? 'DEFAULT',
      token: null,
      tokenExpiresAt: userData.tokenExpiresAt ? new Date(userData.tokenExpiresAt as string | Date) : null,
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: userData.passwordChangedAt ? new Date(userData.passwordChangedAt as string | Date) : null,
    }

    this.items.push(user)
    return ok(user)
  }

  async list(): Promise<Result<User[], AppError>> {
    return ok(this.items)
  }

  async delete(publicId: string): Promise<Result<User, AppError>> {
    const userIndex = this.items.findIndex((item) => item.publicId === publicId)
    if (userIndex === -1) {
      return errOf(new UserNotFoundError())
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
      return errOf(new UserNotFoundError())
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
      return errOf(new UserNotFoundError())
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
