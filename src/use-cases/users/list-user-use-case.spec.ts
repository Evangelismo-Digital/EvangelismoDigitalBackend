import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect } from 'vitest'
import { ListUsersUseCase } from './list-users'
import { isOk } from 'core/shared/result'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'

describe('List Users Use Case', () => {
  it('should return empty list if no users exist', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const listUsersUseCase = new ListUsersUseCase(usersRepository)

    const listResult = await listUsersUseCase.execute()

    expect(isOk(listResult)).toBe(true)
    if (isOk(listResult)) {
      expect(listResult.value.users).toEqual([])
    }
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
