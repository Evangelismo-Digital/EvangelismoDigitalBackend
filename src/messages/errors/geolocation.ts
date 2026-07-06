import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const GEO_ERRORS = {
  NO_PROVIDER: {
    code: 'NO_GEO_PROVIDER',
    message: 'Provedor resiliente de geolocalização requer pelo menos um provedor de geolocalização configurado.',
  },
  NO_ADDRESS_PROVIDER: {
    code: 'NO_ADDRESS_PROVIDER',
    message: 'Provedor resiliente de endereço requer pelo menos um provedor de endereço configurado.',
  },
  ADDRESS_PROVIDER_FAILURE: {
    code: 'ADDRESS_PROVIDER_FAILURE',
    message: 'Falha no provedor de endereços.',
  },
  TIMEOUT_EXCEEDED: {
    code: 'TIMEOUT_EXCEEDED',
    message: 'Tempo limite excedido ao buscar dados nos provedores externos.',
  },
} as const satisfies Record<string, IErrorDetail>
