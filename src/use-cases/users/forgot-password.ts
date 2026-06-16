import { User } from '@prisma/client'
import { randomBytes } from 'crypto'
import { UserNotFoundForPasswordResetError } from '../errors/user-not-found-for-password-reset-error'
import { emailSchema } from '@http/schemas/utils/email'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface ForgotPasswordUseCaseRequest {
  email: string
}

type ForgotPasswordUseCaseResponse = {
  user: User
  token: string
}

const EXPIRES_IN_MINUTES = 15
const TOKEN_LENGTH = 32

export class ForgotPasswordUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute({ email }: ForgotPasswordUseCaseRequest): Promise<Result<ForgotPasswordUseCaseResponse, AppError>> {
    let userExists: User | null = null

    if (emailSchema.safeParse(email).success) {
      const userResult = await this.usersRepository.findBy({ email: email })
      if (isErr(userResult)) {
        return userResult
      }
      userExists = userResult.value
    }

    if (!userExists) {
      return errOf(new UserNotFoundForPasswordResetError())
    }

    const passwordToken = randomBytes(TOKEN_LENGTH).toString('hex')

    const tokenExpiresAt = new Date(Date.now() + EXPIRES_IN_MINUTES * 60 * 1000)

    const tokenData = {
      token: passwordToken,
      tokenExpiresAt: tokenExpiresAt,
    }

    const updateResult = await this.usersRepository.updatePassword(userExists.publicId, {
      ...tokenData,
    })

    if (isErr(updateResult)) {
      return updateResult
    }

    const user = updateResult.value

    if (!user) {
      return errOf(new UserNotFoundForPasswordResetError())
    }

    return ok({
      user,
      token: passwordToken,
    })
  }
}
