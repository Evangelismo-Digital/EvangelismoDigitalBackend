import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { compare } from 'bcryptjs'
import { UserAlreadyExistsError } from '@use-cases/errors/user-already-exists-error'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { UserNotCreatedError } from '@use-cases/errors/user-not-created-error'
import { isOk, isErr, ok, err } from 'core/shared/result'

describe('Register Use Case', () => {
  it('should be able to register', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    const result = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.user.publicId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    }
  })

  it("should hash user's password upon registration", async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    const result = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      const isPasswordCorrectlyHashed = await compare(password, result.value.user.passwordHash)
      expect(isPasswordCorrectlyHashed).toBe(true)
    }
  })

  it('should not be able to register with the same email twice', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const uniqueEmail = `johndoe@gmail.com`
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123!!'

    const result1 = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(result1)).toBe(true)

    const newCpf = cpfValidator.generate()
    const newUsername = 'janedoe'

    const result2 = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: newCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })

    expect(isErr(result2)).toBe(true)
    if (isErr(result2)) {
      expect(result2.error).toBeInstanceOf(UserAlreadyExistsError)
    }
  })

  it('should not be able to register with the same CPF twice', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = `316.526.750-27`

    const password = 'Teste123!!'

    const result1 = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(result1)).toBe(true)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newUsername = 'janedoe'

    const result2 = await registerUseCase.execute({
      name: 'Jane Doe',
      email: newEmail,
      cpf: uniqueCpf,
      password,
      username: newUsername,
      role: UserRole.DEFAULT,
    })

    expect(isErr(result2)).toBe(true)
    if (isErr(result2)) {
      expect(result2.error).toBeInstanceOf(UserAlreadyExistsError)
    }
  })

  it('should not be able to register with the same username twice', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123!!'

    const username = 'johndoe'

    const result1 = await registerUseCase.execute({
      name: 'Jane Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: username,
      role: UserRole.DEFAULT,
    })
    expect(isOk(result1)).toBe(true)

    const newEmail = `janedoe${Date.now()}@gmail.com`
    const newCpf = cpfValidator.generate()

    const result2 = await registerUseCase.execute({
      name: 'John Doe',
      email: newEmail,
      cpf: newCpf,
      password,
      username: username,
      role: UserRole.DEFAULT,
    })

    expect(isErr(result2)).toBe(true)
    if (isErr(result2)) {
      expect(result2.error).toBeInstanceOf(UserAlreadyExistsError)
    }
  })

  it('should return UserNotCreatedError if user is not created', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    vi.spyOn(usersRepository, 'create').mockResolvedValueOnce(ok(null as any))

    const result = await registerUseCase.execute({
      name: 'Test',
      email: `test${Date.now()}@example.com`,
      cpf: '123.456.789-00',
      password: 'Password123!',
      username: 'testuser',
      role: UserRole.DEFAULT,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(UserNotCreatedError)
    }
  })

  it('should return UserAlreadyExistsError if user create returns a UserAlreadyExistsError', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    vi.spyOn(usersRepository, 'findBy').mockResolvedValue(ok(null))
    vi.spyOn(usersRepository, 'create').mockResolvedValueOnce(err(new UserAlreadyExistsError()))

    const result = await registerUseCase.execute({
      name: 'Test',
      email: `test${Date.now()}@example.com`,
      cpf: '123.456.789-00',
      password: 'Password123!',
      username: 'testuser',
      role: UserRole.DEFAULT,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(UserAlreadyExistsError)
    }
  })

  it('should return error if repository returns unexpected error', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const unexpectedErr = new Error('Unexpected')
    vi.spyOn(usersRepository, 'findBy').mockResolvedValue(ok(null))
    vi.spyOn(usersRepository, 'create').mockResolvedValueOnce(err(unexpectedErr) as any)

    const result = await registerUseCase.execute({
      name: 'Test',
      email: `test${Date.now()}@example.com`,
      cpf: '123.456.789-00',
      password: 'Password123!',
      username: 'testuser',
      role: UserRole.DEFAULT,
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBe(unexpectedErr)
    }
  })

  it('should register user with ADMIN role', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)

    const uniqueEmail = `admin${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()
    const password = 'Admin123!'

    const result = await registerUseCase.execute({
      name: 'Admin User',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'adminuser',
      role: UserRole.ADMIN,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value.user.role).toBe(UserRole.ADMIN)
    }
  })
})
