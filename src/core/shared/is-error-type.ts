import { ErrorType } from 'core/types/error-type/error-type'

export function isErrorType(value: string): value is ErrorType {
  return Object.values(ErrorType).includes(value as ErrorType)
}
