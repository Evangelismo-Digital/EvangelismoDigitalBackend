import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const CACHE_ERRORS = {
  OPERATION_ABORTED: {
    code: 'OPERATION_ABORTED',
    message: 'Operação abortada pelo cache manager.',
  },
} as const satisfies Record<string, IErrorDetail>
