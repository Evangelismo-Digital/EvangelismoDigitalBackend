export interface IMailJobData {
  to: string
  subject: string
  message: string
  html: string
  context?: Record<string, unknown>
}
