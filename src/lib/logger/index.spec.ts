import { describe, expect, it, vi, afterEach } from 'vitest'

class TestAppError extends Error {
  type = 'INFRASTRUCTURE'
  failureMode = 'RETRYABLE'
  body = { code: 'TEST_ERROR_CODE' }
}

async function loadErrSerializer(nodeEnv: string) {
  vi.doMock('@env/index', () => ({
    env: { NODE_ENV: nodeEnv, LOG_LEVEL: 'info' },
  }))

  // @ts-expect-error — dynamic import after vi.resetModules() is unresolvable by tsc but works at runtime via vite-tsconfig-paths
  const module = await import('./index')
  return module.errSerializer as (err: unknown) => unknown
}

describe('errSerializer', () => {
  afterEach(() => {
    vi.doUnmock('@env/index')
    vi.resetModules()
  })

  it('em desenvolvimento, preserva o stack completo (pino.stdSerializers.err)', async () => {
    const errSerializer = await loadErrSerializer('development')
    const error = new Error('falha de teste')

    const result = errSerializer(error) as { message: string; stack: string }

    expect(result.message).toBe('falha de teste')
    expect(result.stack).toContain('Error: falha de teste')
    expect(result.stack).toContain('at ')
  })

  it('fora do desenvolvimento (test/prod), reduz para campos buscáveis e um stack truncado', async () => {
    const errSerializer = await loadErrSerializer('test')
    const error = new TestAppError('falha de infraestrutura')

    const result = errSerializer(error) as Record<string, unknown>

    expect(result).toEqual({
      name: 'Error',
      message: 'falha de infraestrutura',
      code: 'TEST_ERROR_CODE',
      type: 'INFRASTRUCTURE',
      failureMode: 'RETRYABLE',
      stack: expect.any(String),
    })
    expect((result.stack as string).split('\n').length).toBeLessThanOrEqual(6)
  })

  it('fora do desenvolvimento, usa error.code quando não há AppError.body.code (ex: erros ioredis)', async () => {
    const errSerializer = await loadErrSerializer('production')
    const error = Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' })

    const result = errSerializer(error) as Record<string, unknown>

    expect(result.code).toBe('ECONNREFUSED')
  })

  it('valores não-Error passam direto, sem serialização', async () => {
    const errSerializer = await loadErrSerializer('test')

    expect(errSerializer('string qualquer')).toBe('string qualquer')
    expect(errSerializer(undefined)).toBeUndefined()
    expect(errSerializer({ some: 'object' })).toEqual({ some: 'object' })
  })
})
