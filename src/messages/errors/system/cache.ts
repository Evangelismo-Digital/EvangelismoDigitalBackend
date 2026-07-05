import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const OPERATION_ABORTED_ERROR: IErrorDetail = {
  code: 'OPERATION_ABORTED',
  message: 'Operação abortada pelo cache manager.',
}
