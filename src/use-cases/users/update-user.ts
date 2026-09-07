import { User } from '@prisma/client'
import { UsersRepository, UserUpdateInput } from 'core/contracts/repository/users-repository.interface'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { Result, ok, err, isErr } from 'core/shared/result'
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
  constructor(private readonly usersRepository: UsersRepository) {}

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
      return err(new UserNotFoundError())
    }

    const conflict = await this.findUniquenessConflict({ email, username }, userToBeUpdated.publicId)

    if (conflict) {
      return conflict
    }

    const updateResult = await this.usersRepository.update(
      userToBeUpdated.publicId,
      buildUpdate({ name, email, username }),
    )

    if (isErr(updateResult)) {
      return updateResult
    }

    return ok({ user: updateResult.value })
  }

  /**
   * Email and username are both unique, and were checked with two copies of the
   * same six lines. Checked in that order, as before: whichever conflicts first
   * is the one reported.
   */
  private async findUniquenessConflict(
    fields: { email?: string; username?: string },
    currentPublicId: string,
  ): Promise<Result<UpdateUserUseCaseResponse, AppError> | null> {
    // Filtered up front rather than skipped with `continue`: a caller that
    // spreads a partial DTO can hand us `undefined` or `null`, and neither is a
    // value to check for uniqueness.
    // The cast is the honest one: `Object.entries` on a type whose properties
    // are all optional resolves its element type to `string`, dropping the
    // `undefined` that a caller spreading a partial DTO genuinely produces.
    // Without it the filter below reads as comparing types with no overlap —
    // and deleting it would let `undefined` through to a uniqueness query.
    const entries = Object.entries(fields) as [string, string | undefined][]
    const provided = entries.filter(([, value]) => value != null)

    for (const [field, value] of provided) {
      const result = await this.usersRepository.findBy({ [field]: value })

      if (isErr(result)) {
        return result
      }

      const owner = result.value

      if (owner && owner.publicId !== currentPublicId) {
        return err(new UserAlreadyExistsError())
      }
    }

    return null
  }
}

/** Only the fields the caller actually supplied, plus the update stamp. */
function buildUpdate({ name, email, username }: Omit<UpdateUserUseCaseRequest, 'publicId'>): UserUpdateInput {
  const data: UserUpdateInput = {}

  if (name !== undefined) data.name = name
  if (email !== undefined) data.email = email
  if (username !== undefined) data.username = username
  data.updatedAt = new Date()

  return data
}
