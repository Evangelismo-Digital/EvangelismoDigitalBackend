import { prisma } from '@lib/prisma'
import { Prisma, User } from '@prisma/client'
import {
  CreateUser,
  FindByToken,
  UserPasswordUpdateInput,
  UsersRepository,
  UserUpdateInput,
  UserWhereUniqueInput,
} from 'core/contracts/repository/users-repository.interface'
import { Result, ok, errOf } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'
import { mapPrismaUserError } from 'errors/mappings/user-error-mapping'

export class PrismaUsersRepository implements UsersRepository {
  async create(data: CreateUser): Promise<Result<User, AppError>> {
    try {
      const user = await prisma.user.create({
        data: {
          name: data.name,
          email: data.email,
          cpf: data.cpf,
          username: data.username,
          passwordHash: data.passwordHash,
          role: data.role,
        },
      })
      return ok(user)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async findBy(where: UserWhereUniqueInput): Promise<Result<User | null, AppError>> {
    try {
      const prismaWhere = {} as Prisma.UserWhereUniqueInput

      if (where.id !== undefined) prismaWhere.id = where.id
      if (where.publicId !== undefined) prismaWhere.publicId = where.publicId
      if (where.email !== undefined) prismaWhere.email = where.email
      if (where.username !== undefined) prismaWhere.username = where.username
      if (where.cpf !== undefined) prismaWhere.cpf = where.cpf
      if (where.token !== undefined) prismaWhere.token = where.token

      const user = await prisma.user.findUnique({
        where: prismaWhere,
      })
      return ok(user)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async findByToken({ token }: FindByToken): Promise<Result<User | null, AppError>> {
    try {
      const user = await prisma.user.findFirst({
        where: {
          token,
        },
      })
      return ok(user)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async list(): Promise<Result<User[], AppError>> {
    try {
      const users = await prisma.user.findMany()
      return ok(users)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async search(query: string, page: number): Promise<Result<User[], AppError>> {
    try {
      const users = await prisma.user.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
        },
        skip: (page - 1) * 20,
        take: 20,
      })

      return ok(users)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async update(publicId: string, data: UserUpdateInput): Promise<Result<User, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { publicId },
        data,
      })
      return ok(user)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async updatePassword(publicId: string, data: UserPasswordUpdateInput): Promise<Result<User, AppError>> {
    try {
      const user = await prisma.user.update({
        where: { publicId },
        data,
      })
      return ok(user)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }

  async delete(publicId: string): Promise<Result<User, AppError>> {
    try {
      const user = await prisma.user.delete({
        where: {
          publicId,
        },
      })
      return ok(user)
    } catch (error) {
      const mapped = mapPrismaUserError(error)
      if (mapped) return errOf(mapped)
      return errOf(new DatabaseQueryError(error))
    }
  }
}
