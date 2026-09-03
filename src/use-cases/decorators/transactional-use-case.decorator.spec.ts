import { describe, it, expect, vi } from 'vitest'
import { TransactionalUseCaseDecorator } from './transactional-use-case.decorator'
import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { ok, err, isOk, isErr, Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { DatabaseQueryError } from 'errors/infrastructure/database-query-error'

/** Minimal DatabaseContext double: runs the callback, surfacing thrown errors. */
function fakeDbContext(): DatabaseContext {
  return {
    runInTransaction: vi.fn(async (cb: () => Promise<unknown>) => cb()),
  } as unknown as DatabaseContext
}

type Req = { id: string }
type Res = Result<{ ok: true }, AppError>

describe('TransactionalUseCaseDecorator', () => {
  it('commits (returns the value) when the wrapped use-case succeeds', async () => {
    const dbContext = fakeDbContext()
    const useCase = { execute: vi.fn(async (): Promise<Res> => ok({ ok: true })) }
    const decorator = new TransactionalUseCaseDecorator<Req, Res>(useCase, dbContext)

    const result = await decorator.execute({ id: 'x' })

    expect(isOk(result)).toBe(true)
    expect(useCase.execute).toHaveBeenCalledWith({ id: 'x' })
    expect(dbContext.runInTransaction).toHaveBeenCalledTimes(1)
  })

  it('rolls back but still resolves with the original failure Result', async () => {
    const failure = err(new DatabaseQueryError(new Error('constraint')))
    const runInTransaction = vi.fn(async (cb: () => Promise<unknown>) => cb())
    const dbContext = { runInTransaction } as unknown as DatabaseContext
    const useCase = { execute: vi.fn(async (): Promise<Res> => failure as Res) }
    const decorator = new TransactionalUseCaseDecorator<Req, Res>(useCase, dbContext)

    const result = await decorator.execute({ id: 'x' })

    expect(result).toBe(failure)
    // The rollback is signalled by the callback throwing inside the transaction.
    await expect(runInTransaction.mock.results[0].value).rejects.toThrow('Rollback requested by domain logic')
  })

  it('re-throws unexpected (non-Result) errors so the global handler maps them to 500', async () => {
    const dbContext = fakeDbContext()
    const crash = new Error('unexpected prisma crash')
    const useCase = { execute: vi.fn(async (): Promise<Res> => Promise.reject(crash)) }
    const decorator = new TransactionalUseCaseDecorator<Req, Res>(useCase, dbContext)

    await expect(decorator.execute({ id: 'x' })).rejects.toBe(crash)
  })

  it('re-throws an error raised by runInTransaction itself', async () => {
    const txError = new Error('could not start transaction')
    const dbContext = {
      runInTransaction: vi.fn(async () => {
        throw txError
      }),
    } as unknown as DatabaseContext
    const useCase = { execute: vi.fn(async (): Promise<Res> => ok({ ok: true })) }
    const decorator = new TransactionalUseCaseDecorator<Req, Res>(useCase, dbContext)

    await expect(decorator.execute({ id: 'x' })).rejects.toBe(txError)
  })

  it('does not execute the wrapped use-case outside the transaction boundary', async () => {
    const calls: string[] = []
    const dbContext = {
      runInTransaction: vi.fn(async (cb: () => Promise<unknown>) => {
        calls.push('tx-start')
        const r = await cb()
        calls.push('tx-end')
        return r
      }),
    } as unknown as DatabaseContext
    const useCase = {
      execute: vi.fn(async (): Promise<Res> => {
        calls.push('use-case')
        return ok({ ok: true })
      }),
    }
    const decorator = new TransactionalUseCaseDecorator<Req, Res>(useCase, dbContext)

    await decorator.execute({ id: 'x' })

    expect(calls).toEqual(['tx-start', 'use-case', 'tx-end'])
  })
})
