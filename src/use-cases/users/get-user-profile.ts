import { User } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface GetUserProfileUseCaseRequest {
  publicId: string
}

type GetUserProfileUseCaseResponse = {
  user: User
}

export class GetUserProfileUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute({ publicId }: GetUserProfileUseCaseRequest): Promise<Result<GetUserProfileUseCaseResponse, AppError>> {
    const userResult = await this.usersRepository.findBy({ publicId })

    if (isErr(userResult)) {
      return userResult
    }

    const user = userResult.value

    if (!user) {
      return err(new UserNotFoundError())
    }

    return ok({ user })
  }
}
