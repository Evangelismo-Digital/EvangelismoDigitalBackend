export interface IErrorDetail {
  code: string

  message: string

  issues?: Record<string, unknown>

  // Allow for additional properties that may be present in the error detail
  [key: string]: unknown
}
