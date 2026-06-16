import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { ForgotPasswordUseCase } from './forgot-password'
import { UserNotFoundForPasswordResetError } from '@use-cases/errors/user-not-found-for-password-reset-error'
import { isOk, isErr, ok } from 'core/shared/result'

describe('Forgot Password Use Case', () => {
  it('should return UserNotFoundForPasswordResetError when user is not found by email', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()
    const password = 'Teste123x!'

    const registerResult = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)

    const findSpy = vi.spyOn(usersRepository, 'findBy').mockResolvedValueOnce(ok(null))

    const forgotResult = await forgotPasswordUseCase.execute({ email: uniqueEmail })

    expect(isErr(forgotResult)).toBe(true)
    if (isErr(forgotResult)) {
      expect(forgotResult.error).toBeInstanceOf(UserNotFoundForPasswordResetError)
    }

    findSpy.mockRestore()
  })

  it('should generate a password reset token and expiration time for the same token', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()
    const password = 'Teste123x!'

    const registerResult = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)

    const before = Date.now()
    const forgotResult = await forgotPasswordUseCase.execute({
      email: uniqueEmail,
    })
    const after = Date.now()

    expect(isOk(forgotResult)).toBe(true)
    if (isOk(forgotResult)) {
      const { user, token } = forgotResult.value
      expect(user.publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      expect(token).toHaveLength(64)
      expect(user.token).toBe(token)

      if (user.tokenExpiresAt) {
        const expiresAt = new Date(user.tokenExpiresAt).getTime()
        const expectedMin = before + 15 * 60 * 1000
        const expectedMax = after + 15 * 60 * 1000
        expect(expiresAt).toBeGreaterThanOrEqual(expectedMin - 1000)
        expect(expiresAt).toBeLessThanOrEqual(expectedMax + 1000)
      } else {
        throw new Error('tokenExpiresAt is not set')
      }
    }
  })

  it('should return UserNotFoundForPasswordResetError when user is not updated', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)

    const uniqueEmail = `johndoe${Date.now()}@gmail.com`
    const uniqueCpf = cpfValidator.generate()
    const password = 'Teste123x!'

    const registerResult = await registerUseCase.execute({
      name: 'John Doe',
      email: uniqueEmail,
      cpf: uniqueCpf,
      password,
      username: 'johndoe',
      role: UserRole.DEFAULT,
    })
    expect(isOk(registerResult)).toBe(true)

    const updatePasswordSpy = vi.spyOn(usersRepository, 'updatePassword').mockResolvedValueOnce(ok(null as any))

    const forgotResult = await forgotPasswordUseCase.execute({ email: uniqueEmail })

    expect(isErr(forgotResult)).toBe(true)
    if (isErr(forgotResult)) {
      expect(forgotResult.error).toBeInstanceOf(UserNotFoundForPasswordResetError)
    }

    updatePasswordSpy.mockRestore()
  })
})
