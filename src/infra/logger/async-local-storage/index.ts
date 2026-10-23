import { IAsyncContext } from '@common/interfaces/async-local-storage.interface'
import { AsyncLocalStorage } from 'node:async_hooks'

export const asyncLocalStorage = new AsyncLocalStorage<IAsyncContext>()
