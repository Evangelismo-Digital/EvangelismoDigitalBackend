import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { Prisma, User } from '@prisma/client'
import {
  CreateUser,
  FindByToken,
  UserPasswordUpdateInput,
  UsersRepository,
  UserUpdateInput,
  UserWhereUniqueInput,
} from 'core/contracts/repository/users-repository.interface'
import { Result, ok, err } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { PrismaErrorMapper } from '@lib/prisma/utils/prisma-error-mapper'
import { USERS_PAGE_SIZE } from 'core/constants/pagination'

export class PrismaUsersRepository implements UsersRepository {
  constructor(
    private readonly errorMapper: PrismaErrorMapper<AppError>,
    private readonly dbContext: DatabaseContext = new DatabaseContext(),
  ) {}

  async create(data: CreateUser): Promise<Result<User, AppError>> {
    try {
      const user = await this.dbContext.client.user.create({
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
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async findBy(where: UserWhereUniqueInput): Promise<Result<User | null, AppError>> {
    try {
      const conditions = buildLookupConditions(where)

      if (conditions.length === 0) {
        return ok(null)
      }

      const user = await this.dbContext.client.user.findFirst({
        where: conditions.length === 1 ? conditions[0] : { OR: conditions },
      })
      return ok(user)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async findByToken({ token }: FindByToken): Promise<Result<User | null, AppError>> {
    try {
      const user = await this.dbContext.client.user.findFirst({
        where: {
          token,
        },
      })
      return ok(user)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async list(): Promise<Result<User[], AppError>> {
    try {
      const users = await this.dbContext.client.user.findMany()

      return ok(users)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async search(query: string, page: number): Promise<Result<User[], AppError>> {
    try {
      const users = await this.dbContext.client.user.findMany({
        where: {
          name: {
            contains: query,
            mode: 'insensitive',
          },
        },
        skip: (page - 1) * USERS_PAGE_SIZE,
        take: USERS_PAGE_SIZE,
      })

      return ok(users)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async update(publicId: string, data: UserUpdateInput): Promise<Result<User, AppError>> {
    return await this.applyUpdate(publicId, data)
  }

  async updatePassword(publicId: string, data: UserPasswordUpdateInput): Promise<Result<User, AppError>> {
    return await this.applyUpdate(publicId, data)
  }

  /**
   * The two public methods stay separate because the CONTRACTS differ — one
   * accepts profile fields, the other only a password hash and its reset token,
   * and that distinction is what stops a caller from clearing a password
   * through the profile route. The write itself is the same statement, and
   * having written it twice is how the two drift apart.
   */
  private async applyUpdate(
    publicId: string,
    data: UserUpdateInput | UserPasswordUpdateInput,
  ): Promise<Result<User, AppError>> {
    try {
      const user = await this.dbContext.client.user.update({
        where: { publicId },
        data,
      })

      return ok(user)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }

  async delete(publicId: string): Promise<Result<User, AppError>> {
    try {
      const user = await this.dbContext.client.user.delete({
        where: {
          publicId,
        },
      })
      return ok(user)
    } catch (error) {
      return err(this.errorMapper.mapToKnownError(error))
    }
  }
}

/**
 * Every unique column is looked up the same way, so the fields are listed once
 * instead of as six near-identical branches. An absent field contributes no
 * condition; no conditions at all means "nothing was asked for".
 */
const USER_LOOKUP_FIELDS = ['id', 'publicId', 'email', 'username', 'cpf', 'token'] as const

function buildLookupConditions(where: UserWhereUniqueInput): Prisma.UserWhereInput[] {
  return USER_LOOKUP_FIELDS.filter((field) => where[field] !== undefined).map((field) => ({ [field]: where[field] }))
}
