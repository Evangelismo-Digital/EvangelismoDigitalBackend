import { User } from '@prisma/client'
import { UsersRepository } from '@modules/users/repositories/users-repository.interface'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { Result, ok, err, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

interface GetUserProfileUseCaseRequest {
  publicId: string
}

type GetUserProfileUseCaseResponse = {
  user: User
}

export class GetUserProfileUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

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
