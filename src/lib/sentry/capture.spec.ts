import { vi, describe, it, expect, beforeEach } from 'vitest'

const mockIsInitialized = vi.fn()
const mockCaptureException = vi.fn()
const mockSetUser = vi.fn()
const mockSetContext = vi.fn()

vi.mock('@sentry/node', () => ({
  isInitialized: (...args: unknown[]) => mockIsInitialized(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  withScope: (callback: (scope: unknown) => void) => {
    callback({ setUser: mockSetUser, setContext: mockSetContext })
  },
}))

const mockGetRequestId = vi.fn()
const mockGetUserId = vi.fn()

vi.mock('@lib/logger', () => ({
  getRequestId: (...args: unknown[]) => mockGetRequestId(...args),
  getUserId: (...args: unknown[]) => mockGetUserId(...args),
}))

import { captureError } from './capture'

describe('captureError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsInitialized.mockReturnValue(true)
    mockGetRequestId.mockReturnValue('req-1')
    mockGetUserId.mockReturnValue(undefined)
  })

  it('não faz nada quando o Sentry não foi inicializado (sem DSN)', () => {
    mockIsInitialized.mockReturnValue(false)

    captureError(new Error('falha'), { jobId: 'job-1' })

    expect(mockCaptureException).not.toHaveBeenCalled()
    expect(mockSetUser).not.toHaveBeenCalled()
  })

  it('captura uma instância de Error diretamente', () => {
    const error = new Error('falha real')

    captureError(error)

    expect(mockCaptureException).toHaveBeenCalledWith(error)
  })

  it('normaliza valores não-Error em uma Error antes de capturar', () => {
    captureError('string lançada como erro')

    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error))
    expect(mockCaptureException.mock.calls[0][0].message).toBe('string lançada como erro')
  })

  it('define o usuário no scope quando getUserId retorna um valor', () => {
    mockGetUserId.mockReturnValue('user-42')

    captureError(new Error('falha'))

    expect(mockSetUser).toHaveBeenCalledWith({ id: 'user-42' })
  })

  it('não define usuário no scope quando getUserId retorna undefined', () => {
    mockGetUserId.mockReturnValue(undefined)

    captureError(new Error('falha'))

    expect(mockSetUser).not.toHaveBeenCalled()
  })

  it('inclui requestId e o contexto extra em runtime', () => {
    captureError(new Error('falha'), { jobId: 'job-1', publicId: 'evt-1' })

    expect(mockSetContext).toHaveBeenCalledWith('runtime', {
      requestId: 'req-1',
      jobId: 'job-1',
      publicId: 'evt-1',
    })
  })

  it('usa contexto vazio por padrão quando não informado', () => {
    captureError(new Error('falha'))

    expect(mockSetContext).toHaveBeenCalledWith('runtime', { requestId: 'req-1' })
  })
})
