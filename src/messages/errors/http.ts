import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const HTTP_ERRORS = {
  INTERNAL_SERVER: {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Erro interno do servidor!',
  },
  INVALID_JSON: {
    code: 'INVALID_JSON',
    message: 'O corpo da requisição não está em formato JSON válido. Verifique a estrutura dos dados enviados.',
  },
  RESOURCE_NOT_FOUND: {
    code: 'RESOURCE_NOT_FOUND',
    message: 'Recurso não encontrado!',
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Serviço temporariamente indisponível. Por favor, tente novamente mais tarde.',
  },
} as const satisfies Record<string, IErrorDetail>
