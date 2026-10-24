import { Deadline } from '@common/utils/deadline'
import { Result } from '@common/utils/result'
import { AppError } from '@common/errors/app-error'
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
