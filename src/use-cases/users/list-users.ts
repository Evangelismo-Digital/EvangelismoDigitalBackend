import { User } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

type ListUsersUseCaseResponse = {
  users: User[]
}

export class ListUsersUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(): Promise<Result<ListUsersUseCaseResponse, AppError>> {
    const listResult = await this.usersRepository.list()

    if (isErr(listResult)) {
      return listResult
    }

    const users = listResult.value

    return ok({ users })
  }
}
