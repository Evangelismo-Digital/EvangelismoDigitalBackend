import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'

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
  ipAddress?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface FormsRepository {
  create(data: IFormSubmissionInputData): Promise<Result<IFormSubmission, AppError>>
  findByEmail(email: string): Promise<Result<IFormSubmission, AppError>>
}
