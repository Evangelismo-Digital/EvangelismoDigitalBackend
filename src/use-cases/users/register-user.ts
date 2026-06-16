import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { User } from '@prisma/client'
import { hash } from 'bcryptjs'
import { env } from '@env/index'
import { UserRole, UsersRepository } from 'core/contracts/repository/users-repository.interface'
import { UserNotCreatedError } from '@use-cases/errors/user-not-created-error'
import { Result, ok, errOf, isErr } from 'core/shared/result'
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
    const existingByEmail = await this.usersRepository.findBy({ email })
    if (isErr(existingByEmail)) {
      return existingByEmail
    }
    if (existingByEmail.value) {
      return errOf(new UserAlreadyExistsError())
    }

    const existingByCpf = await this.usersRepository.findBy({ cpf })
    if (isErr(existingByCpf)) {
      return existingByCpf
    }
    if (existingByCpf.value) {
      return errOf(new UserAlreadyExistsError())
    }

    const existingByUsername = await this.usersRepository.findBy({ username })
    if (isErr(existingByUsername)) {
      return existingByUsername
    }
    if (existingByUsername.value) {
      return errOf(new UserAlreadyExistsError())
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
      return errOf(new UserNotCreatedError())
    }

    return ok({ user })
  }
}
