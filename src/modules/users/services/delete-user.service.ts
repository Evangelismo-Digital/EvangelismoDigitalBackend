import { UsersRepository } from '@modules/users/repositories/users-repository.interface'
import { UserNotFoundError } from '@modules/users/errors/user-not-found-error'
import { Result, ok, err, isErr } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

interface DeleteUserUseCaseRequest {
  publicId: string
}

export class DeleteUserUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({ publicId }: DeleteUserUseCaseRequest): Promise<Result<void, AppError>> {
    const userResult = await this.usersRepository.findBy({ publicId })

    if (isErr(userResult)) {
      return userResult
    }

    const userExists = userResult.value

    if (!userExists) {
      return err(new UserNotFoundError())
    }

    const deleteResult = await this.usersRepository.delete(userExists.publicId)
    if (isErr(deleteResult)) {
      return deleteResult
    }

    return ok(undefined)
  }
}
