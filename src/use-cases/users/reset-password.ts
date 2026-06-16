import { User } from '@prisma/client'
import { hash } from 'bcryptjs'
import { InvalidTokenError } from '../errors/invalid-token-error'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { env } from '@env/index'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface ResetPasswordUseCaseCaseRequest {
  token: string
  password: string
}

type ResetPasswordUseCaseCaseResponse = {
  user: User
}

export class ResetPasswordUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({
    token,
    password,
  }: ResetPasswordUseCaseCaseRequest): Promise<Result<ResetPasswordUseCaseCaseResponse, AppError>> {
    const userResult = await this.usersRepository.findByToken({ token: token })

    if (isErr(userResult)) {
      return userResult
    }

    const userExists = userResult.value

    if (!userExists || !userExists.tokenExpiresAt || userExists.tokenExpiresAt < new Date()) {
      return errOf(new InvalidTokenError())
    }

    const passwordHash = await hash(password, env.HASH_SALT_ROUNDS)

    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      passwordHash: passwordHash,
      passwordChangedAt: new Date(),
      token: null,
      tokenExpiresAt: null,
      updatedAt: new Date(),
    })

    if (isErr(updateResult)) {
      return updateResult
    }

    const user = updateResult.value

    return ok({ user })
  }
}
