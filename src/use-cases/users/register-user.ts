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
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({
    name,
    email,
    cpf,
    username,
    password,
    role,
  }: RegisterUserUseCaseRequest): Promise<Result<RegisterUserUseCaseResponse, AppError>> {
    const taken = await this.findExistingUser({ email, cpf, username })

    if (taken) {
      return taken
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

    // The repository interface promises a User on `ok`, so the type system
    // calls this dead. It is not: this is the use-case/repository boundary, the
    // guard is what turns a contract violation by an adapter into a domain
    // error instead of a null dereference three frames later, and
    // register-use-case.spec.ts exercises exactly that path.
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!user) {
      return err(new UserNotCreatedError())
    }

    return ok({ user })
  }

  /**
   * Email, CPF and username are all unique; any one of them already in use
   * means the same answer. Returns the failure to propagate, or null when the
   * identity is free.
   */
  private async findExistingUser(params: {
    email: string
    cpf: string
    username: string
  }): Promise<Result<RegisterUserUseCaseResponse, AppError> | null> {
    const existing = await this.usersRepository.findBy(params)

    if (isErr(existing)) {
      return existing
    }

    return existing.value ? err(new UserAlreadyExistsError()) : null
  }
}
