import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const ANALYTICS_ERRORS = {
  PROXY_REQUIRED: {
    code: 'ANALYTICS_PROXY_REQUIRED',
    message: 'Não autorizado!',
  },
  VISITOR_NOT_FOUND: {
    code: 'ANALYTICS_VISITOR_NOT_FOUND',
    message: 'Visitante não encontrado!',
  },
} as const satisfies Record<string, IErrorDetail>
