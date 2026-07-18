import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import nodemailer from 'nodemailer'
import { env } from '@env/index'
import { NodemailerMailSender } from './nodemailer-mail-sender'

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(),
  },
}))

const createTransport = nodemailer.createTransport as Mock

function makeTransporterMock() {
  return {
    verify: vi.fn().mockResolvedValue(true),
    sendMail: vi.fn().mockResolvedValue({ messageId: 'mock-id' }),
  }
}

const request = {
  to: 'dest@example.com',
  subject: 'Assunto',
  message: 'mensagem em texto',
  html: '<p>mensagem</p>',
}

describe('NodemailerMailSender', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create the transporter with the SMTP env config on first send', async () => {
    const transporter = makeTransporterMock()
    createTransport.mockReturnValueOnce(transporter)

    await new NodemailerMailSender().send(request)

    expect(createTransport).toHaveBeenCalledExactlyOnceWith({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_EMAIL,
        pass: env.SMTP_PASSWORD,
      },
    })
    expect(transporter.verify).toHaveBeenCalledOnce()
  })

  it('should reuse the transporter across sends (create and verify exactly once)', async () => {
    const transporter = makeTransporterMock()
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await sender.send(request)
    await sender.send(request)

    expect(createTransport).toHaveBeenCalledOnce()
    expect(transporter.verify).toHaveBeenCalledOnce()
    expect(transporter.sendMail).toHaveBeenCalledTimes(2)
  })

  it('should throw on verification failure and retry creation + verification on the next send', async () => {
    const failing = makeTransporterMock()
    const verifyError = new Error('Invalid login')
    failing.verify.mockRejectedValueOnce(verifyError)
    const healthy = makeTransporterMock()
    createTransport.mockReturnValueOnce(failing).mockReturnValueOnce(healthy)

    const sender = new NodemailerMailSender()

    await expect(sender.send(request)).rejects.toThrow(verifyError)
    expect(failing.sendMail).not.toHaveBeenCalled()

    // Regressão: o transportador não verificado não pode ficar em cache.
    await expect(sender.send(request)).resolves.toEqual({ messageId: 'mock-id' })
    expect(createTransport).toHaveBeenCalledTimes(2)
    expect(healthy.verify).toHaveBeenCalledOnce()
    expect(healthy.sendMail).toHaveBeenCalledOnce()
  })

  it('should send with from = SMTP_EMAIL and the full payload, without attachments key when omitted', async () => {
    const transporter = makeTransporterMock()
    createTransport.mockReturnValueOnce(transporter)

    await new NodemailerMailSender().send(request)

    expect(transporter.sendMail).toHaveBeenCalledExactlyOnceWith({
      from: env.SMTP_EMAIL,
      to: request.to,
      subject: request.subject,
      text: request.message,
      html: request.html,
    })
    expect('attachments' in transporter.sendMail.mock.calls[0][0]).toBe(false)
  })

  it('should include attachments when provided', async () => {
    const transporter = makeTransporterMock()
    createTransport.mockReturnValueOnce(transporter)
    const attachments = [{ filename: 'comprovante.pdf', content: 'dados' }]

    await new NodemailerMailSender().send({ ...request, attachments })

    expect(transporter.sendMail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ attachments }))
  })

  it('should propagate sendMail failures to the caller', async () => {
    const transporter = makeTransporterMock()
    const smtpError = new Error('452 4.2.2 Mailbox full')
    transporter.sendMail.mockRejectedValueOnce(smtpError)
    createTransport.mockReturnValueOnce(transporter)

    await expect(new NodemailerMailSender().send(request)).rejects.toThrow(smtpError)
  })

  it('should keep the verified transporter cached even after a sendMail failure', async () => {
    const transporter = makeTransporterMock()
    transporter.sendMail.mockRejectedValueOnce(new Error('transient SMTP failure'))
    createTransport.mockReturnValue(transporter)

    const sender = new NodemailerMailSender()
    await expect(sender.send(request)).rejects.toThrow('transient SMTP failure')

    await expect(sender.send(request)).resolves.toEqual({ messageId: 'mock-id' })
    expect(createTransport).toHaveBeenCalledOnce()
    expect(transporter.verify).toHaveBeenCalledOnce()
  })
})
