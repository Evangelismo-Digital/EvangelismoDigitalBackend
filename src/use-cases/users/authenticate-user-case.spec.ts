import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { InMemoryAuthenticationAuditRepository } from '@repositories/in-memory/in-memory-authentication-audit-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { compare } from 'bcryptjs'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { AuthenticateUserUseCase } from './authenticate-user'
import { InvalidCredentialsError } from '@use-cases/errors/invalid-credentials-error'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { AuthenticationAuditUseCase } from '@use-cases/authentication-audit/authentication-audit'
import { AuthenticationStatus } from '@prisma/client'

describe('Authenticate User Use Case', () => {
  const auditContext = {
    ipAddress: '203.0.113.1',
    remotePort: '1234',
    userAgent: 'vitest',
    origin: 'http://localhost',
  }

  it('should be able to find a user by email', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const authenticationAuditRepository = new InMemoryAuthenticationAuditRepository()
    const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository)
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username,
      role: UserRole.DEFAULT,
    })

    const { user } = await authenticateUserUseCase.execute({
      login: uniqueEmail,
      password,
      auditContext,
    })

    expect(user.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(authenticationAuditRepository.items).toHaveLength(1)
    expect(authenticationAuditRepository.items[0].status).toBe(AuthenticationStatus.SUCCESS)
  })

  it('should be able to find a user by username', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const authenticationAuditRepository = new InMemoryAuthenticationAuditRepository()
    const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository)
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username,
      role: UserRole.DEFAULT,
    })

    const { user } = await authenticateUserUseCase.execute({
      login: username,
      password,
      auditContext,
    })

    expect(user.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    expect(authenticationAuditRepository.items).toHaveLength(1)
    expect(authenticationAuditRepository.items[0].status).toBe(AuthenticationStatus.SUCCESS)
  })

  it("should compare user's password upon authentication", async () => {
    const usersRepository = new InMemoryUsersRepository()
    const authenticationAuditRepository = new InMemoryAuthenticationAuditRepository()
    const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository)
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username,
      role: UserRole.DEFAULT,
    })

    const { user } = await authenticateUserUseCase.execute({
      login: uniqueEmail,
      password,
      auditContext,
    })

    const isPasswordCorrectlyHashed = await compare(password, user.passwordHash)

    expect(isPasswordCorrectlyHashed).toBe(true)
    expect(authenticationAuditRepository.items).toHaveLength(1)
    expect(authenticationAuditRepository.items[0].status).toBe(AuthenticationStatus.SUCCESS)
  })

  it('should not be able to register with invalid email', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const authenticationAuditRepository = new InMemoryAuthenticationAuditRepository()
    const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository)
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123!!'

    const invalidEmail = 'invalid-email@gmail.com'

    await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username,
      role: UserRole.DEFAULT,
    })

    await expect(
      authenticateUserUseCase.execute({
        login: invalidEmail,
        password,
        auditContext,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(authenticationAuditRepository.items).toHaveLength(1)
    expect(authenticationAuditRepository.items[0].status).toBe(AuthenticationStatus.USER_NOT_EXISTS)
  })

  it('should not be able to register with invalid username', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const authenticationAuditRepository = new InMemoryAuthenticationAuditRepository()
    const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository)
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123!!'

    const invalidUsername = 'invalid-username'

    await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username,
      role: UserRole.DEFAULT,
    })

    await expect(
      authenticateUserUseCase.execute({
        login: invalidUsername,
        password,
        auditContext,
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError)

    expect(authenticationAuditRepository.items).toHaveLength(1)
    expect(authenticationAuditRepository.items[0].status).toBe(AuthenticationStatus.USER_NOT_EXISTS)
  })

  it('should continue authentication even when audit persistence fails', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const authenticationAuditRepository = {
      create: vi.fn(async () => {
        throw new Error('audit unavailable')
      }),
    }
    const authenticationAuditUseCase = new AuthenticationAuditUseCase(authenticationAuditRepository)
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const authenticateUserUseCase = new AuthenticateUserUseCase(usersRepository, authenticationAuditUseCase)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const username = 'johndoe'
    const uniqueCpf = cpfValidator.generate()

    const password = 'Teste123x!'

    await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username,
      role: UserRole.DEFAULT,
    })

    const { user } = await authenticateUserUseCase.execute({
      login: uniqueEmail,
      password,
      auditContext,
    })

    expect(user.publicId).toBeDefined()
    expect(authenticationAuditRepository.create).toHaveBeenCalledOnce()
  })
})
