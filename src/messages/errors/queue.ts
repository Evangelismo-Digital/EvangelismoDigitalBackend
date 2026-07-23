import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const QUEUE_ERRORS = {
  JOB_ALREADY_PROCESSING: {
    code: 'JOB_ALREADY_PROCESSING',
    message: 'Bloqueio de Idempotência: Job em processamento simultâneo por outra thread.',
  },
  SMTP_DISPATCH_FAILED: {
    code: 'SMTP_DISPATCH_FAILED',
    message: 'Falha crítica ao despachar os e-mails via servidor SMTP.',
  },
} as const satisfies Record<string, IErrorDetail>
