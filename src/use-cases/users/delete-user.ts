import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface DeleteUserUseCaseRequest {
  publicId: string
}

export class DeleteUserUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute({ publicId }: DeleteUserUseCaseRequest): Promise<Result<void, AppError>> {
    const userResult = await this.usersRepository.findBy({ publicId })

    if (isErr(userResult)) {
      return userResult
    }

    const userExists = userResult.value

    if (!userExists) {
      return errOf(new UserNotFoundError())
    }

    const deleteResult = await this.usersRepository.delete(userExists.publicId)
    if (isErr(deleteResult)) {
      return deleteResult
    }

    return ok(undefined)
  }
}
