import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('./index', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn(), debug: vi.fn() }
  return { logger }
})

import { logError } from './helpers'
import { logger } from './index'

describe('logError', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loga em error por padrão, aninhando o erro sob a chave err (deixa o serializer decidir o formato)', () => {
    const error = new Error('falha real')

    logError(error, { duration: 42 })

    expect(logger.error).toHaveBeenCalledWith({ err: error, duration: 42 }, 'Erro inesperado')
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('usa a mensagem informada', () => {
    const error = new Error('falha real')

    logError(error, {}, 'Falha no healthcheck')

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Falha no healthcheck')
  })

  it('usa o contexto vazio por padrão quando não informado', () => {
    const error = new Error('falha real')

    logError(error)

    expect(logger.error).toHaveBeenCalledWith({ err: error }, 'Erro inesperado')
  })

  it('respeita options.level para logar em warn', () => {
    const error = new Error('falha recuperável')

    logError(error, { jobId: 'job-1' }, 'Aviso', { level: 'warn' })

    expect(logger.warn).toHaveBeenCalledWith({ err: error, jobId: 'job-1' }, 'Aviso')
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('respeita options.level para logar em fatal', () => {
    const error = new Error('falha fatal')

    logError(error, {}, 'Fatal', { level: 'fatal' })

    expect(logger.fatal).toHaveBeenCalledWith({ err: error }, 'Fatal')
  })

  it('funciona com valores não-Error (ex: string lançada)', () => {
    logError('string lançada', { context: 'x' })

    expect(logger.error).toHaveBeenCalledWith({ err: 'string lançada', context: 'x' }, 'Erro inesperado')
  })
})
