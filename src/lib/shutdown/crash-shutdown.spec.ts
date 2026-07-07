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

describe('crashShutdown', () => {
  let exitSpy: any
  let crashShutdown: any

  beforeEach(async () => {
    vi.clearAllMocks()
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    vi.useFakeTimers()
    
    // Ensure fresh module state for each test by dynamic import
    // @ts-expect-error — Dynamic import after vi.resetModules() is unresolvable by tsc but works at runtime via vite-tsconfig-paths
    const module = await import('@lib/shutdown/crash-shutdown')
    crashShutdown = module.crashShutdown
  })

  afterEach(() => {
    exitSpy.mockRestore()
    vi.useRealTimers()
    vi.resetModules()
  })

  it('runs cleanup, captures exception, flushes Sentry and exits with code 1', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const error = new Error('Test error')

    await crashShutdown(error, cleanup)

    expect(cleanup).toHaveBeenCalledOnce()
    expect(mockCaptureException).toHaveBeenCalledWith(error)
    expect(mockFlush).toHaveBeenCalledWith(2000)
    expect(exitSpy).toHaveBeenCalledWith(1)
  })

  it('guards against double invocation and exits immediately', async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined)
    const error1 = new Error('Error 1')
    const error2 = new Error('Error 2')

    // Call first time
    const promise1 = crashShutdown(error1, cleanup)
    // Call second time
    const promise2 = crashShutdown(error2, cleanup)

    await Promise.all([promise1, promise2])

    expect(cleanup).toHaveBeenCalledOnce() // Cleanup only runs once
    expect(exitSpy).toHaveBeenCalledTimes(2) // Both invoke exit
  })

  it('exits even if cleanup throws an error', async () => {
    const cleanup = vi.fn().mockRejectedValue(new Error('Cleanup failed'))
    const error = new Error('Test error')

    await crashShutdown(error, cleanup)

    expect(cleanup).toHaveBeenCalledOnce()
    expect(exitSpy).toHaveBeenCalledWith(1)
  })
})
