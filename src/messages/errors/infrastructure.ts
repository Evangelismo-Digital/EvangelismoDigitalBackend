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
  DEADLINE_EXCEEDED: {
    code: 'DEADLINE_EXCEEDED',
    message: 'O tempo limite total da requisição foi atingido antes da conclusão da operação.',
  },
  CIRCUIT_OPEN: {
    code: 'CIRCUIT_OPEN',
    message: 'Provedor externo temporariamente suspenso após falhas repetidas.',
  },
  SERVICE_OVERLOAD: {
    code: 'SERVICE_OVERLOAD',
    message: 'Número de requisições simultâneas excedeu o limite de maxPendingFetches na memória cache do Redis.',
  },
} as const satisfies Record<string, IErrorDetail>
