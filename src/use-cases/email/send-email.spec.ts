import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@utils/send-email', () => ({
  sendEmail: vi.fn(),
}))

import { sendEmail } from '@utils/send-email'
import { SendEmailUseCase } from './send-email'
import { isOk, isErr } from 'core/shared/result'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'

describe('SendEmailUseCase', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call sendEmail with correct parameters and return its result', async () => {
    const mockResult = { message: 'test-id' }
    ;(sendEmail as any).mockResolvedValueOnce(mockResult)

    const useCase = new SendEmailUseCase()
    const params = {
      to: 'test@example.com',
      subject: 'Test Subject',
      message: 'This is a test message.',
      html: '<p>This is a test message.</p>',
    }

    const result = await useCase.execute(params)

    expect(sendEmail).toHaveBeenCalledWith({
      ...params,
      attachments: undefined,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(mockResult)
    }
  })

  it('should return SmtpDispatchError when sendEmail fails', async () => {
    const error = new Error('Send failed')
    ;(sendEmail as any).mockRejectedValueOnce(error)

    const useCase = new SendEmailUseCase()
    const params = {
      to: 'test@example.com',
      subject: 'Test Subject',
      message: 'This is a test message.',
      html: '<p>This is a test message.</p>',
    }

    const result = await useCase.execute(params)

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(SmtpDispatchError)
    }
  })

  it('should call sendEmail with attachments if provided', async () => {
    const mockResult = { messageId: 'with-attachments' }
    ;(sendEmail as any).mockResolvedValueOnce(mockResult)

    const useCase = new SendEmailUseCase()
    const attachments = [{ filename: 'file.txt', content: 'hello' }]
    const params = {
      to: 'attach@example.com',
      subject: 'With Attachments',
      message: 'msg',
      html: '<b>msg</b>',
      attachments,
    }

    const result = await useCase.execute(params)

    expect(sendEmail).toHaveBeenCalledWith(params)
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(mockResult)
    }
  })
})
