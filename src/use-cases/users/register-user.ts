import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { User } from '@prisma/client'
import { hash } from 'bcryptjs'
import { env } from '@env/index'
import { UserRole, UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { UserNotCreatedError } from '@use-cases/errors/user-not-created-error'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'

interface RegisterUserUseCaseRequest {
  name: string
  email: string
  cpf: string
  password: string
  username: string
  role: UserRole
}

type RegisterUserUseCaseResponse = {
  user: User
}

export class RegisterUserUseCase {
  constructor(private usersRepository: UsersRepository) {}

  async execute({
    name,
    email,
    cpf,
    username,
    password,
    role,
  }: RegisterUserUseCaseRequest): Promise<Result<RegisterUserUseCaseResponse, AppError>> {
    const userWithExistingEmail = await this.usersRepository.findBy({ email })

    if (isErr(userWithExistingEmail)) {
      return userWithExistingEmail
    }

    if (userWithExistingEmail.value) {
      return err(new UserAlreadyExistsError())
    }

    const userWithExistingCpf = await this.usersRepository.findBy({ cpf })

    if (isErr(userWithExistingCpf)) {
      return userWithExistingCpf
    }

    if (userWithExistingCpf.value) {
      return err(new UserAlreadyExistsError())
    }

    const userWithExistingUsername = await this.usersRepository.findBy({ username })

    if (isErr(userWithExistingUsername)) {
      return userWithExistingUsername
    }

    if (userWithExistingUsername.value) {
      return err(new UserAlreadyExistsError())
    }

    const passwordHash = await hash(password, env.HASH_SALT_ROUNDS)

    const createResult = await this.usersRepository.create({
      name,
      email,
      cpf,
      username,
      passwordHash,
      role,
    })

    if (isErr(createResult)) {
      return createResult
    }

    const user = createResult.value

    if (!user) {
      return err(new UserNotCreatedError())
    }

    return ok({ user })
  }
}
