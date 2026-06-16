import { User } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface SearchUsersUseCaseRequest {
  query: string
  page: number
}

interface SearchUsersUseCaseResponse {
  users: User[]
}

export class SearchUsersUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute({ query, page }: SearchUsersUseCaseRequest): Promise<Result<SearchUsersUseCaseResponse, AppError>> {
    const searchResult = await this.usersRepository.search(query, page)

    if (isErr(searchResult)) {
      return searchResult
    }

    const users = searchResult.value

    if (!users || users.length === 0) {
      return errOf(new UserNotFoundError())
    }

    return ok({ users })
  }
}
