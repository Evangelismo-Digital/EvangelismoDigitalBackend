import { IMailJobData } from '../queue/mail-job-data.interface'

export interface IOutboxDispatchData {
  publicId: string
  emails: IMailJobData[]
  /** ISO string (dados de job são serializados como JSON). Presente apenas em eventos expiráveis. */
  expiresAt?: string
}
