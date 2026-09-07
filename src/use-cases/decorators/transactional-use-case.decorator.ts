import { DatabaseContext } from '@lib/prisma/helpers/database-context'
import { Result, isErr } from 'core/shared/result'

interface IUseCase<IRequest, IResponse> {
  execute(request: IRequest): Promise<IResponse>
}

// Um erro interno apenas para sinalizar o Rollback
class RollbackTransactionError<IResponse> extends Error {
  constructor(public readonly result: IResponse) {
    super('Rollback requested by domain logic')
  }
}

export class TransactionalUseCaseDecorator<IRequest, IResponse extends Result<unknown, unknown>> implements IUseCase<
  IRequest,
  IResponse
> {
  constructor(
    private readonly useCase: IUseCase<IRequest, IResponse>,
    private readonly dbContext: DatabaseContext,
  ) {}

  async execute(request: IRequest): Promise<IResponse> {
    try {
      // 1. Iniciamos a transação
      return await this.dbContext.runInTransaction(async () => {
        // 2. Executamos o Use Case Real
        const result = await this.useCase.execute(request)

        // 3. A MÁGICA: Se o resultado for falha, lançamos o erro para o Prisma desfazer tudo
        if (isErr(result)) {
          throw new RollbackTransactionError(result)
        }

        // Se for sucesso, retornamos e o Prisma faz o Commit automático
        return result
      })
    } catch (error) {
      // 4. Capturamos o erro aqui fora

      // Se foi o nosso erro de controle, recuperamos o Result original e retornamos como se nada tivesse acontecido
      if (error instanceof RollbackTransactionError) {
        // `instanceof` cannot carry the generic, so the narrowing lands on
        // RollbackTransactionError<unknown>. The value came from `execute`
        // three lines above, so IResponse is what it is.
        return error.result as IResponse
      }

      // Se for um erro inesperado (bug, crash do banco que o repositório não pegou), relançamos
      // O Controller vai pegar isso e transformar em 500 Internal Server Error
      throw error
    }
  }
}
