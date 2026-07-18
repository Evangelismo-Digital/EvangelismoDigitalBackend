import { describe, it, expect, vi, afterEach } from 'vitest'
import { SendEmailUseCase } from './send-email'
import { isOk, isErr } from 'core/shared/result'
import { SmtpDispatchError } from '@lib/errors/queue/smtp-dispatch-error'
import { MailSender } from 'core/contracts/lib/mail/mail-sender.interface'

function makeMailSenderFake() {
  return { send: vi.fn() } satisfies MailSender
}

describe('SendEmailUseCase', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('should call the mail sender with correct parameters and return its result', async () => {
    const mailSender = makeMailSenderFake()
    const mockResult = { message: 'test-id' }
    mailSender.send.mockResolvedValueOnce(mockResult)

    const useCase = new SendEmailUseCase(mailSender)
    const params = {
      to: 'test@example.com',
      subject: 'Test Subject',
      message: 'This is a test message.',
      html: '<p>This is a test message.</p>',
    }

    const result = await useCase.execute(params)

    expect(mailSender.send).toHaveBeenCalledWith({
      ...params,
      attachments: undefined,
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(mockResult)
    }
  })

  it('should return SmtpDispatchError when the mail sender fails', async () => {
    const mailSender = makeMailSenderFake()
    const error = new Error('Send failed')
    mailSender.send.mockRejectedValueOnce(error)

    const useCase = new SendEmailUseCase(mailSender)
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

  it('should call the mail sender with attachments if provided', async () => {
    const mailSender = makeMailSenderFake()
    const mockResult = { messageId: 'with-attachments' }
    mailSender.send.mockResolvedValueOnce(mockResult)

    const useCase = new SendEmailUseCase(mailSender)
    const attachments = [{ filename: 'file.txt', content: 'hello' }]
    const params = {
      to: 'attach@example.com',
      subject: 'With Attachments',
      message: 'msg',
      html: '<b>msg</b>',
      attachments,
    }

    const result = await useCase.execute(params)

    expect(mailSender.send).toHaveBeenCalledWith(params)
    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(mockResult)
    }
  })

  it('should return SmtpDispatchError even when the rejection value is not an Error', async () => {
    const mailSender = makeMailSenderFake()
    mailSender.send.mockRejectedValueOnce('string rejection')

    const useCase = new SendEmailUseCase(mailSender)
    const result = await useCase.execute({
      to: 'test@example.com',
      subject: 'Assunto',
      message: 'mensagem',
      html: '<p>mensagem</p>',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error).toBeInstanceOf(SmtpDispatchError)
    }
  })

  it('should wrap the original error inside SmtpDispatchError', async () => {
    const mailSender = makeMailSenderFake()
    const originalError = new Error('ECONNREFUSED 127.0.0.1:587')
    mailSender.send.mockRejectedValueOnce(originalError)

    const useCase = new SendEmailUseCase(mailSender)
    const result = await useCase.execute({
      to: 'test@example.com',
      subject: 'Assunto',
      message: 'mensagem',
      html: '<p>mensagem</p>',
    })

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      const expected = new SmtpDispatchError(originalError)
      expect(result.error.body).toEqual(expected.body)
      expect(result.error.type).toBe(expected.type)
    }
  })

  it('should pass an empty attachments array through as-is', async () => {
    const mailSender = makeMailSenderFake()
    mailSender.send.mockResolvedValueOnce({ messageId: 'empty-attachments' })

    const useCase = new SendEmailUseCase(mailSender)
    const params = {
      to: 'test@example.com',
      subject: 'Assunto',
      message: 'mensagem',
      html: '<p>mensagem</p>',
      attachments: [],
    }

    await useCase.execute(params)

    expect(mailSender.send).toHaveBeenCalledWith(params)
    const callArg = mailSender.send.mock.calls[0][0]
    expect(callArg.attachments).toEqual([])
  })

  it('should return the resolved SentMessageInfo untouched', async () => {
    const mailSender = makeMailSenderFake()
    const info = {
      messageId: '<abc@smtp.example.com>',
      accepted: ['test@example.com'],
      rejected: [],
      response: '250 OK',
    }
    mailSender.send.mockResolvedValueOnce(info)

    const useCase = new SendEmailUseCase(mailSender)
    const result = await useCase.execute({
      to: 'test@example.com',
      subject: 'Assunto',
      message: 'mensagem',
      html: '<p>mensagem</p>',
    })

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(info)
    }
  })
})
