import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { SearchUsersUseCase } from './search-users-use-case'
import { isOk } from 'core/shared/result'

describe('Search Users Use Case', () => {
  it('should return empty list if search query yields no matches', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const searchUsersUseCase = new SearchUsersUseCase(usersRepository)

    const searchResult = await searchUsersUseCase.execute({ query: 'nonexistent', page: 1 })

    expect(isOk(searchResult)).toBe(true)
    if (isOk(searchResult)) {
      expect(searchResult.value.users).toEqual([])
    }
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
