import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const INFRA_ERRORS = {
  SERVICE_BUSY: {
    code: 'SERVICE_BUSY',
    message: 'Serviço temporariamente indisponível devido ao limite de requisições.',
  },
  PROVIDER_FAILURE: {
    code: 'PROVIDER_FAILURE',
    message: 'Falha de sistema ao processar dados no provedor de serviços externos.',
  },
  DATABASE_QUERY_FAILURE: {
    code: 'DATABASE_QUERY_FAILURE',
    message: 'Falha de sistema ao processar consulta no banco de dados.',
  },
  SERVICE_OVERLOAD: {
    code: 'SERVICE_OVERLOAD',
    message: 'Número de requisições simultâneas excedeu o limite de maxPendingFetches na memória cache do Redis.',
  },
} as const satisfies Record<string, IErrorDetail>
