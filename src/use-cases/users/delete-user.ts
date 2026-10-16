import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { AppError, UserNotFoundError } from 'errors'
import { Result, ok, err, isErr } from 'core/shared/result'

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
