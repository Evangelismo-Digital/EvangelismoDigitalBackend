import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const OUTBOX_ERRORS = {
  EVENT_NOT_FOUND: {
    code: 'OUTBOX_EVENT_NOT_FOUND',
    message: 'O evento de outbox solicitado não foi encontrado no banco de dados.',
  },
  OPERATION_FAILED: {
    code: 'OUTBOX_OPERATION_FAILED',
    message: 'Falha ao processar operação da outbox no banco de dados.',
  },
} as const satisfies Record<string, IErrorDetail>

export const UNKNOWN_OUTBOX_EVENT_TYPE_ERROR_FN = (eventType: string): IErrorDetail => ({
  code: 'UNKNOWN_OUTBOX_EVENT_TYPE',
  message: `Nenhuma estratégia de despacho registrada para o tipo de evento '${eventType}'.`,
})
