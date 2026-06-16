import { User } from '@prisma/client'
import { UsersRepository, UserUpdateInput } from 'core/contracts/repository/users-repository.interface'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface UpdateUserUseCaseRequest {
  publicId: string
  name?: string
  email?: string
  username?: string
}

type UpdateUserUseCaseResponse = {
  user: User
}

export class UpdateUserUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute({
    publicId,
    name,
    email,
    username,
  }: UpdateUserUseCaseRequest): Promise<Result<UpdateUserUseCaseResponse, AppError>> {

    const userResult = await this.usersRepository.findBy({ publicId })

    if (isErr(userResult)) {
      return userResult
    }

    const userToBeUpdated = userResult.value

    if (!userToBeUpdated) {
      return errOf(new UserNotFoundError())
    }

    const data: UserUpdateInput = {}

    if (name) data.name = name
    if (email) data.email = email
    if (username) data.username = username
    data.updatedAt = new Date()

    if (email) {
      const emailResult = await this.usersRepository.findBy({ email })

      if (isErr(emailResult)) {
        return emailResult
      }

      const userWithExistingEmail = emailResult.value

      if (userWithExistingEmail && userWithExistingEmail.publicId !== userToBeUpdated.publicId) {
        return errOf(new UserAlreadyExistsError())
      }
    }

    if (username) {
      const usernameResult = await this.usersRepository.findBy({ username })

      if (isErr(usernameResult)) {
        return usernameResult
      }

      const usernameWithExistingUsername = usernameResult.value
      
      if (usernameWithExistingUsername && usernameWithExistingUsername.publicId !== userToBeUpdated.publicId) {
        return errOf(new UserAlreadyExistsError())
      }
    }

    const updateResult = await this.usersRepository.update(userToBeUpdated.publicId, {
      ...data,
    })

    if (isErr(updateResult)) {
      return updateResult
    }

    const user = updateResult.value

    return ok({ user })
  }
}
