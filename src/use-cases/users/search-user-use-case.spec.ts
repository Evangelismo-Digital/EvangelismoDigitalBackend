import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { UserNotFoundError } from '@use-cases/errors/user-not-found-error'
import { SearchUsersUseCase } from './search-users-use-case'
import { isOk, isErr, ok } from 'core/shared/result'

describe('Search Users Use Case', () => {
  it('should return UserNotFoundError if search returns null', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const searchUsersUseCase = new SearchUsersUseCase(usersRepository)

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

    const searchSpy = vi.spyOn(usersRepository, 'search').mockResolvedValue(ok(null as any))

    const searchResult = await searchUsersUseCase.execute({ query: 'john', page: 1 })

    expect(isErr(searchResult)).toBe(true)
    if (isErr(searchResult)) {
      expect(searchResult.error).toBeInstanceOf(UserNotFoundError)
    }

    searchSpy.mockRestore()
  })

  it('should return UserNotFoundError if search returns empty array', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const searchUsersUseCase = new SearchUsersUseCase(usersRepository)

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

    const searchSpy = vi.spyOn(usersRepository, 'search').mockResolvedValue(ok([]))

    const searchResult = await searchUsersUseCase.execute({ query: 'notfound', page: 1 })

    expect(isErr(searchResult)).toBe(true)
    if (isErr(searchResult)) {
      expect(searchResult.error).toBeInstanceOf(UserNotFoundError)
    }

    searchSpy.mockRestore()
  })

  it('should be able to search and return users', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const searchUsersUseCase = new SearchUsersUseCase(usersRepository)

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

    const searchResult = await searchUsersUseCase.execute({ query: 'doe', page: 1 })

    expect(isOk(searchResult)).toBe(true)
    if (isOk(searchResult)) {
      expect(searchResult.value.users.length).toBeGreaterThanOrEqual(2)
      expect(searchResult.value.users).toEqual(expect.arrayContaining([user1, user2]))
    }
  })
})
