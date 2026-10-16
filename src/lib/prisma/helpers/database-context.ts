import { asyncLocalStorage } from '@lib/async-local-storage'
import { AsyncLocalStorageNotInitializedError } from 'errors'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaTransactionClient } from '@lib/prisma/helpers/prisma-transaction-client'
import { prisma as defaultPrisma } from '..'

export class DatabaseContext {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  get client(): PrismaTransactionClient | PrismaClient {
    const prismaTx = asyncLocalStorage.getStore()?.prismaTransaction

    return prismaTx ?? this.prisma
  }

  /**
   * Executes a callback function within a database transaction.
   *
   * This method provides automatic transaction management with the following features:
   * - **Nested transaction support**: If already in a transaction, reuses the existing one
   * - **Automatic rollback**: Rolls back on errors
   * - **Context propagation**: Transaction context is available to all nested calls
   *
   * @template T - The return type of the callback function
   * @param callback - The async function to execute within the transaction
   * @param options - Optional transaction configuration
   * @param options.isolationLevel - The isolation level for the transaction (e.g., 'ReadCommitted', 'Serializable')
   * @param options.maxWait - Maximum time to wait for a transaction slot (in milliseconds)
   * @param options.timeout - Maximum time for the transaction to complete (in milliseconds)
   *
   * @returns A promise that resolves with the callback's return value
   *
   * @throws {AsyncLocalStorageNotInitializedError} When AsyncLocalStorage is not properly initialized
   * @throws {Error} Any error thrown by the callback will cause a rollback and be re-thrown
   * @remarks
   * - When nested, the inner transaction options are ignored and the outer transaction is reused
   * - All database operations within the callback should use `db.client` to participate in the transaction
   * - The transaction will automatically commit if the callback completes successfully
   * - The transaction will automatically rollback if the callback throws an error
   */

  async runInTransaction<T>(
    callback: () => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel
      maxWait?: number
      timeout?: number
    },
  ): Promise<T> {
    const store = asyncLocalStorage.getStore()

    if (!store) {
      throw new AsyncLocalStorageNotInitializedError()
    }

    if (store.prismaTransaction) {
      return await callback()
    }

    return await this.prisma.$transaction(async (tx) => {
      return await asyncLocalStorage.run(
        {
          ...store,
          prismaTransaction: tx,
        },
        callback,
      )
    }, options)
  }
}
