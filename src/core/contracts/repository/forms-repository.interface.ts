import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export interface IFormSubmissionInputData {
  name: string
  lastName: string
  email: string
  decisaoPorCristo: boolean
  location?: string
  ipAddress?: string
}

export interface IFormSubmission {
  id: number
  publicId: string
  name: string
  lastName: string
  email: string
  decisaoPorCristo: boolean
  location?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface FormsRepository {
  create(data: IFormSubmissionInputData): Promise<Result<IFormSubmission, AppError>>
  findByEmail(email: string): Promise<Result<IFormSubmission, AppError>>
}
