import { Deadline } from 'core/shared/deadline'
import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { EnumGeoPrecision } from './geo-provider.interface'

export interface IAddressData {
  logradouro?: string
  bairro?: string
  localidade: string
  uf: string
  lat?: number
  lon?: number
  precision?: EnumGeoPrecision
  providerName?: string
}

export interface IAddressProvider {
  fetchAddress(cep: string, deadline?: Deadline): Promise<Result<IAddressData | null, AppError>>
}
