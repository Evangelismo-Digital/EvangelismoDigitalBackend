import { User } from '@prisma/client'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export enum UserRole {
  ADMIN = 'ADMIN',
  DEFAULT = 'DEFAULT',
}

export interface CreateUser {
  name: string
  email: string
  cpf: string
  username: string
  passwordHash: string
  role: UserRole
}

export interface UserWhereUniqueInput {
  id?: number
  publicId?: string
  email?: string
  username?: string
  cpf?: string
  token?: string
}

export interface UserPasswordUpdateInput {
  passwordHash?: string
  token?: string | null
  tokenExpiresAt?: Date | null
  passwordChangedAt?: Date | null
  updatedAt?: Date
}

export interface UserUpdateInput {
  name?: string
  email?: string
  username?: string
  cpf?: string
  updatedAt?: Date
}

export interface FindByToken {
  token: string
}

export interface UsersRepository {
  create(data: CreateUser): Promise<Result<User, AppError>>
  findByToken(token: FindByToken): Promise<Result<User | null, AppError>>
  findBy(where: UserWhereUniqueInput): Promise<Result<User | null, AppError>>
  list(): Promise<Result<User[], AppError>>
  search(query: string, page: number): Promise<Result<User[], AppError>>
  update(publicId: string, data: UserUpdateInput): Promise<Result<User, AppError>>
  updatePassword(publicId: string, data: UserPasswordUpdateInput): Promise<Result<User, AppError>>
  delete(publicId: string): Promise<Result<User, AppError>>
}
