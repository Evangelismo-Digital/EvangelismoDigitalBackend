import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'
import { messages } from 'messages/constants/messages'

export const ZOD_VALIDATION_ERROR: IErrorDetail = {
  code: 'VALIDATION_ERROR',
  message: messages.validation.invalidData,
}
