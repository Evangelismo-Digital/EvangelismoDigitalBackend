import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { DeleteUserUseCase } from './delete-user'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { isOk, isErr, ok } from 'core/shared/result'

describe('Delete User Use Case', () => {
  it('should return UserNotFoundError if user does not exist', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const deleteUserUseCase = new DeleteUserUseCase(usersRepository)

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

    const deleteResult = await deleteUserUseCase.execute({
      publicId: user.publicId,
    })

    expect(isErr(deleteResult)).toBe(true)
    if (isErr(deleteResult)) {
      expect(deleteResult.error).toBeInstanceOf(UserNotFoundError)
    }

    findSpy.mockRestore()
  })

  it('should be able to delete a user by publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const deleteUserUseCase = new DeleteUserUseCase(usersRepository)

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

    const deleteResult = await deleteUserUseCase.execute({
      publicId: user.publicId,
    })

    expect(isOk(deleteResult)).toBe(true)

    const foundResult = await usersRepository.findBy({
      publicId: user.publicId,
    })

    expect(isOk(foundResult)).toBe(true)
    if (isOk(foundResult)) {
      expect(foundResult.value).toBeNull()
    }
  })

  it('should not delete other users when deleting by publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const deleteUserUseCase = new DeleteUserUseCase(usersRepository)

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

    const deleteResult = await deleteUserUseCase.execute({
      publicId: user1.publicId,
    })
    expect(isOk(deleteResult)).toBe(true)

    const foundResult1 = await usersRepository.findBy({
      publicId: user1.publicId,
    })
    expect(isOk(foundResult1)).toBe(true)
    if (isOk(foundResult1)) {
      expect(foundResult1.value).toBeNull()
    }

    const foundResult2 = await usersRepository.findBy({
      publicId: user2.publicId,
    })
    expect(isOk(foundResult2)).toBe(true)
    if (isOk(foundResult2)) {
      expect(foundResult2.value).not.toBeNull()
      expect(foundResult2.value?.publicId).toBe(user2.publicId)
    }
  })

  it('should return UserNotFoundError when deleting with invalid publicId', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const deleteUserUseCase = new DeleteUserUseCase(usersRepository)

    const deleteResult = await deleteUserUseCase.execute({
      publicId: 'non-existent-public-id',
    })

    expect(isErr(deleteResult)).toBe(true)
    if (isErr(deleteResult)) {
      expect(deleteResult.error).toBeInstanceOf(UserNotFoundError)
    }
  })
})
