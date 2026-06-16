import { User } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

type ListUsersUseCaseResponse = {
  users: User[]
}

export class ListUsersUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute(): Promise<Result<ListUsersUseCaseResponse, AppError>> {
    const listResult = await this.usersRepository.list()

    if (isErr(listResult)) {
      return listResult
    }

    const users = listResult.value

    if (!users || users.length === 0) {
      return errOf(new UserNotFoundError())
    }

    return ok({ users })
  }
}
