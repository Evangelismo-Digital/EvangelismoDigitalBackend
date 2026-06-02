import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const SERVICE_BUSY_ERROR: IErrorDetail = {
  code: 'SERVICE_BUSY',
  message: 'Serviço temporariamente indisponível devido a limite de requisições.',
}

export const PROVIDER_FAILURE_ERROR: IErrorDetail = {
  code: 'PROVIDER_FAILURE',
  message: 'Falha de sistema ao tentar processar dados no provedor de serviços externos.',
}

export const DATABASE_QUERY_FAILURE_ERROR: IErrorDetail = {
  code: 'DATABASE_QUERY_FAILURE',
  message: 'Falha de sistema ao processar consulta no banco de dados.',
}

export const SERVICE_OVERLOAD_ERROR: IErrorDetail = {
  code: 'SERVICE_OVERLOAD',
  message: 'Número de requisições simultâneas excedeu o limite de maxPendingFetches na memória cache do Redis.',
}

export const TIMEOUT_EXCEEDED_ERROR: IErrorDetail = {
  code: 'TIMEOUT_EXCEEDED',
  message: 'Tempo limite excedido ao buscar dados nos provedores externos.',
}

export const NO_GEO_PROVIDER_ERROR_MESSAGE = 'Provedor resiliente de geolocalização requer pelo menos um provedor de geolocalização configurado.'

export const NO_ADDRESS_PROVIDER_ERROR_MESSAGE = 'Provedor resiliente de endereço requer pelo menos um provedor de endereço configurado.'
