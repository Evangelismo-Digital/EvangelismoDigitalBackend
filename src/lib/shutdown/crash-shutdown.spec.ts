import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

const { mockCaptureException, mockFlush } = vi.hoisted(() => {
  return {
    mockCaptureException: vi.fn(),
    mockFlush: vi.fn().mockResolvedValue(true),
  }
})

vi.mock('@sentry/node', () => ({
  captureException: mockCaptureException,
  flush: mockFlush,
}))

const mockLogger = {
  fatal: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}
vi.mock('@lib/logger', () => ({ logger: mockLogger }))

describe('crashShutdown', () => {
  let exitSpy: any
  let crashShutdown: any

  beforeEach(async () => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.useFakeTimers()

    // @ts-expect-error — Dynamic import after vi.resetModules() is unresolvable by tsc but works at runtime via vite-tsconfig-paths
    const module = await import('@lib/shutdown/crash-shutdown')
    crashShutdown = module.crashShutdown
  })

  afterEach(() => {
    exitSpy.mockRestore()
    vi.useRealTimers()
    vi.resetModules()
  })

  it('captures exception and flushes Sentry and logs success', async () => {
    const error = new Error('Test error')

    await crashShutdown(error)

    expect(mockCaptureException).toHaveBeenCalledWith(error)
    expect(mockFlush).toHaveBeenCalledWith(2000)
    expect(mockLogger.fatal).toHaveBeenCalledWith(
      { err: error },
      'Travamento não tratado detectado, iniciando sequência de encerramento por falha...',
    )
    expect(mockLogger.info).toHaveBeenCalledWith('Logs do Sentry enviados com sucesso.')
    expect(exitSpy).not.toHaveBeenCalled()
  })

  it('logs error if Sentry flush fails', async () => {
    const error = new Error('Test error')
    const flushError = new Error('Flush failed')
    mockFlush.mockRejectedValueOnce(flushError)

    await crashShutdown(error)

    expect(mockLogger.error).toHaveBeenCalledWith(
      { err: flushError },
      'Erro ao enviar os logs do Sentry durante o encerramento por travamento',
    )
  })
})
