import { User } from '@prisma/client'
import { UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { Result, ok, isErr } from 'core/shared/result'
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

    const users = searchResult.value || []

    return ok({ users })
  }
}
