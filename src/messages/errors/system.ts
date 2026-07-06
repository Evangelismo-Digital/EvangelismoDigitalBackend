import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const SYSTEM_ERRORS = {
  ASYNC_LOCAL_STORAGE_NOT_INITIALIZED: {
    code: 'ASYNC_LOCAL_STORAGE_NOT_INITIALIZED',
    message: 'Async Local Storage is not initialized.',
  },
} as const satisfies Record<string, IErrorDetail>
