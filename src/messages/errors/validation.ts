import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const VALIDATION_ERRORS = {
  ZOD_VALIDATION: {
    code: 'VALIDATION_ERROR',
    message: 'Dados de registro inválidos!',
  },
} as const satisfies Record<string, IErrorDetail>
