import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { ListUsersUseCase } from './list-users'
import { isOk, isErr, ok } from 'core/shared/result'

describe('List Users Use Case', () => {
  it('should return UserNotFoundError if list of users does not exist', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const listUsersUseCase = new ListUsersUseCase(usersRepository)

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

    const listSpy = vi.spyOn(usersRepository, 'list').mockResolvedValue(ok(null as any))

    const listResult = await listUsersUseCase.execute()

    expect(isErr(listResult)).toBe(true)
    if (isErr(listResult)) {
      expect(listResult.error).toBeInstanceOf(UserNotFoundError)
    }

    listSpy.mockRestore()
  })

  it('should return UserNotFoundError if list of users is equal to zero', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const listUsersUseCase = new ListUsersUseCase(usersRepository)

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

    const listSpy = vi.spyOn(usersRepository, 'list').mockResolvedValue(ok([]))

    const listResult = await listUsersUseCase.execute()

    expect(isErr(listResult)).toBe(true)
    if (isErr(listResult)) {
      expect(listResult.error).toBeInstanceOf(UserNotFoundError)
    }

    listSpy.mockRestore()
  })

  it('should be able to get a list of users', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const listUsersUseCase = new ListUsersUseCase(usersRepository)

    const firstEmail = `johndoe${Date.now()}@gmail.com`
    const firstUsername = 'johndoe'
    const firstCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    const registerResult1 = await registerUseCase.execute({
      name: 'John Doe',
      email: firstEmail,
      cpf: firstCpf,
      password,
      username: firstUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult1)).toBe(true)
    const user1 = (registerResult1 as any).value.user

    const secondEmail = `janedoe${Date.now()}@gmail.com`
    const secondUsername = 'janedoe'
    const secondCpf = cpfValidator.generate()

    const registerResult2 = await registerUseCase.execute({
      name: 'Jane Doe',
      email: secondEmail,
      cpf: secondCpf,
      password,
      username: secondUsername,
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult2)).toBe(true)
    const user2 = (registerResult2 as any).value.user

    const listResult = await listUsersUseCase.execute()

    expect(isOk(listResult)).toBe(true)
    if (isOk(listResult)) {
      expect(listResult.value.users).toHaveLength(2)
      expect(listResult.value.users).toEqual(expect.arrayContaining([user1, user2]))
    }
  })
})
