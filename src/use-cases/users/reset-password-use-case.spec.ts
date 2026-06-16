import { InMemoryUsersRepository } from '@repositories/in-memory/in-memory-users-repository'
import { describe, it, expect, vi } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { compare } from 'bcryptjs'
import { UserRole } from 'core/contracts/repository/users-repository.interface'
import { cpf as cpfValidator } from 'cpf-cnpj-validator'
import { ForgotPasswordUseCase } from './forgot-password'
import { ResetPasswordUseCase } from './reset-password'
import { InvalidTokenError } from '@use-cases/errors/invalid-token-error'
import { isOk, isErr, ok, errOf } from 'core/shared/result'

describe('Reset Password Use Case', () => {
  it('should return InvalidTokenError when user is not found by token', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)
    const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository)

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

    const forgotResult = await forgotPasswordUseCase.execute({
      email: uniqueEmail,
    })
    expect(isOk(forgotResult)).toBe(true)

    const resetResult = await resetPasswordUseCase.execute({
      token: 'some-token',
      password: 'newPassword123!',
    })

    expect(isErr(resetResult)).toBe(true)
    if (isErr(resetResult)) {
      expect(resetResult.error).toBeInstanceOf(InvalidTokenError)
    }
  })

  it('should return InvalidTokenError when tokenExpiresAt does not exist', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)
    const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository)

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

    const forgotResult = await forgotPasswordUseCase.execute({
      email: uniqueEmail,
    })
    expect(isOk(forgotResult)).toBe(true)
    const { token, user } = (forgotResult as any).value

    await usersRepository.updatePassword(user.publicId, {
      tokenExpiresAt: null,
    })

    const resetResult = await resetPasswordUseCase.execute({
      token: token,
      password: 'newPassword123!',
    })

    expect(isErr(resetResult)).toBe(true)
    if (isErr(resetResult)) {
      expect(resetResult.error).toBeInstanceOf(InvalidTokenError)
    }
  })

  it('should return InvalidTokenError when tokenExpiresAt is in the past', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)
    const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository)

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

    const forgotResult = await forgotPasswordUseCase.execute({
      email: uniqueEmail,
    })
    expect(isOk(forgotResult)).toBe(true)
    const { token, user } = (forgotResult as any).value

    await usersRepository.updatePassword(user.publicId, {
      tokenExpiresAt: new Date(Date.now() - 1000 * 60 * 60),
    })

    const resetResult = await resetPasswordUseCase.execute({
      token: token,
      password: 'newPassword123!',
    })

    expect(isErr(resetResult)).toBe(true)
    if (isErr(resetResult)) {
      expect(resetResult.error).toBeInstanceOf(InvalidTokenError)
    }
  })

  it('should reset user password', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)
    const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository)

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

    const forgotResult = await forgotPasswordUseCase.execute({
      email: uniqueEmail,
    })
    expect(isOk(forgotResult)).toBe(true)
    const { token } = (forgotResult as any).value

    const before = Date.now()

    const resetResult = await resetPasswordUseCase.execute({
      token,
      password: 'newPassword123!',
    })

    const after = Date.now()

    expect(isOk(resetResult)).toBe(true)
    if (isOk(resetResult)) {
      const user = resetResult.value.user
      if (user.passwordChangedAt && user.updatedAt) {
        const passWordChangedAt = new Date(user.passwordChangedAt).getTime()

        expect(passWordChangedAt).toBeGreaterThanOrEqual(before)
        expect(passWordChangedAt).toBeLessThanOrEqual(after)

        const updatedAt = new Date(user.updatedAt).getTime()

        expect(updatedAt).toBeGreaterThanOrEqual(before)
        expect(updatedAt).toBeLessThanOrEqual(after)
      } else {
        throw new Error('passwordChangedAt is not set')
      }

      const isPasswordCorrectlyHashed = await compare('newPassword123!', user.passwordHash)

      expect(isPasswordCorrectlyHashed).toBe(true)

      expect(user.token).toBeNull()
      expect(user.tokenExpiresAt).toBeNull()
    }
  })

  it('should return error when user password is not updated', async () => {
    const usersRepository = new InMemoryUsersRepository()
    const registerUseCase = new RegisterUserUseCase(usersRepository)
    const forgotPasswordUseCase = new ForgotPasswordUseCase(usersRepository)
    const resetPasswordUseCase = new ResetPasswordUseCase(usersRepository)

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

    const forgotResult = await forgotPasswordUseCase.execute({
      email: uniqueEmail,
    })
    expect(isOk(forgotResult)).toBe(true)
    const { token } = (forgotResult as any).value

    const expectedErr = new Error('Failed to update user')
    const resetSpy = vi.spyOn(usersRepository, 'updatePassword').mockResolvedValueOnce(errOf(expectedErr) as any)

    const resetResult = await resetPasswordUseCase.execute({
      token,
      password: 'newPassword123!',
    })

    expect(isErr(resetResult)).toBe(true)
    if (isErr(resetResult)) {
      expect(resetResult.error).toBe(expectedErr)
    }

    resetSpy.mockRestore()
  })
})
