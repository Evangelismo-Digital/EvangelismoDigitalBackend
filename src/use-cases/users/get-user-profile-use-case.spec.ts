import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { GetUserProfileUseCase } from './get-user-profile'
import { isOk, isErr, ok } from 'core/shared/result'

describe('Get User Profile Use Case', () => {
  it('should return UserNotFoundError if user does not exist', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const getUserProfileUseCase = new GetUserProfileUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    const registerResult = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: username,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const findSpy = vi.spyOn(usersRepository, 'findBy').mockResolvedValue(ok(null))

    const profileResult = await getUserProfileUseCase.execute({
      publicId: user.publicId,
    })

    expect(isErr(profileResult)).toBe(true)
    if (isErr(profileResult)) {
      expect(profileResult.error).toBeInstanceOf(UserNotFoundError)
    }

    findSpy.mockRestore()
  })

  it('should be able to get a user profile by publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const getUserProfileUseCase = new GetUserProfileUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    const registerResult = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: username,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)
    const user = (registerResult as any).value.user

    const profileResult = await getUserProfileUseCase.execute({
      publicId: user.publicId,
    })

    expect(isOk(profileResult)).toBe(true)
    if (isOk(profileResult)) {
      expect(profileResult.value.user.publicId).toBe(user.publicId)
    }
  })

  it('should not get userprofile1 based on userProfile2', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const getUserProfileUseCase = new GetUserProfileUseCase(usersRepository)

    const registerResult1 = await registerUseCase.execute({
      name: 'User One',
      email: `userone${Date.now()}@gmail.com`,
      cpf: cpfValidator.generate(),
      password: 'Password1!',
      username: 'userone',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult1)).toBe(true)
    const user1 = (registerResult1 as any).value.user

    const registerResult2 = await registerUseCase.execute({
      name: 'User Two',
      email: `usertwo${Date.now()}@gmail.com`,
      cpf: cpfValidator.generate(),
      password: 'Password2!',
      username: 'usertwo',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult2)).toBe(true)
    const user2 = (registerResult2 as any).value.user

    const profileResult1 = await getUserProfileUseCase.execute({
      publicId: user1.publicId,
    })
    expect(isOk(profileResult1)).toBe(true)

    const profileResult2 = await getUserProfileUseCase.execute({
      publicId: user2.publicId,
    })
    expect(isOk(profileResult2)).toBe(true)

    if (isOk(profileResult1) && isOk(profileResult2)) {
      expect(profileResult1.value.user).not.toBe(profileResult2.value.user)
      expect(profileResult1.value.user.publicId).toBe(user1.publicId)
      expect(profileResult2.value.user.publicId).toBe(user2.publicId)
    }
  })

  it('should return UserNotFoundError when getting profile with invalid publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const getUserProfileUseCase = new GetUserProfileUseCase(usersRepository)

    const profileResult = await getUserProfileUseCase.execute({
      publicId: 'non-existent-public-id',
    })

    expect(isErr(profileResult)).toBe(true)
    if (isErr(profileResult)) {
      expect(profileResult.error).toBeInstanceOf(UserNotFoundError)
    }
  })
})
