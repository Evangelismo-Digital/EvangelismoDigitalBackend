import { describe, it, expect } from 'vitest'
import pino from 'pino'

describe('Logger Redaction (Finding A3)', () => {
  it('should redact sensitive PII paths and leave adjacent fields intact', () => {
    const logs: string[] = []
    const destination = {
      write(msg: string) {
        logs.push(msg)
      },
    }

    const logger = pino(
      {
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            '*.password',
            '*.cpf',
            '*.token',
            '*.rawToken',
            '*.email',
          ],
          censor: '[REDACTED]',
        },
      },
      destination,
    )

    logger.info(
      {
        req: {
          headers: {
            authorization: 'Bearer secret-token',
            cookie: 'session=123',
            'user-agent': 'SafeBrowser/1.0',
          },
        },
        res: {
          headers: {
            'set-cookie': 'session=456',
            'content-type': 'application/json',
          },
        },
        user: {
          password: 'my-password',
          cpf: '12345678901',
          token: 'xyz',
          rawToken: 'abc',
          email: 'test@example.com',
          id: 'user-123',
        },
      },
      'Test message',
    )

    const parsedLog = JSON.parse(logs[0])

    // Check redactions
    expect(parsedLog.req.headers.authorization).toBe('[REDACTED]')
    expect(parsedLog.req.headers.cookie).toBe('[REDACTED]')
    expect(parsedLog.res.headers['set-cookie']).toBe('[REDACTED]')
    expect(parsedLog.user.password).toBe('[REDACTED]')
    expect(parsedLog.user.cpf).toBe('[REDACTED]')
    expect(parsedLog.user.token).toBe('[REDACTED]')
    expect(parsedLog.user.rawToken).toBe('[REDACTED]')
    expect(parsedLog.user.email).toBe('[REDACTED]')

    // Check adjacent non-PII fields
    expect(parsedLog.req.headers['user-agent']).toBe('SafeBrowser/1.0')
    expect(parsedLog.res.headers['content-type']).toBe('application/json')
    expect(parsedLog.user.id).toBe('user-123')
    expect(parsedLog.msg).toBe('Test message')
  })
})
