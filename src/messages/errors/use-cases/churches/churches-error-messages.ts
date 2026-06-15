import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const CHURCH_NOT_FOUND_ERROR: IErrorDetail = {
  code: 'CHURCH_NOT_FOUND',
  message: 'Igreja não encontrada.',
}

export const CHURCH_ALREADY_EXISTS_ERROR: IErrorDetail = {
  code: 'CHURCH_ALREADY_EXISTS',
  message: 'Já existe uma igreja cadastrada com este nome e/ou coordenadas',
}

export const INVALID_CEP_ERROR: IErrorDetail = {
  code: 'INVALID_CEP',
  message: 'O CEP fornecido não existe.',
}

export const COORDINATES_NOT_FOUND_ERROR: IErrorDetail = {
  code: 'COORDINATES_NOT_FOUND',
  message: 'Coordenadas não encontradas para o endereço fornecido.',
}

export const NO_ADDRESS_PROVIDED_ERROR: IErrorDetail = {
  code: 'NO_ADDRESS_PROVIDED',
  message: 'Nenhum endereço fornecido para conversão de CEP.',
}

export const LATITUDE_OUT_OF_RANGE_ERROR: IErrorDetail = {
  code: 'LATITUDE_OUT_OF_RANGE',
  message: 'A Latitude deve estar entre -90 e 90 graus.',
}

export const LONGITUDE_OUT_OF_RANGE_ERROR: IErrorDetail = {
  code: 'LONGITUDE_OUT_OF_RANGE',
  message: 'A longitude deve estar entre -180 e 180 graus.',
}

export const CREATE_CHURCH_FAILED_ERROR: IErrorDetail = {
  code: 'CREATE_CHURCH_FAILED',
  message: 'Falha ao criar a igreja.',
}

export const EMPTY_CHURCH_LIST_ERROR: IErrorDetail = {
  code: 'EMPTY_CHURCH_LIST',
  message: 'Lista de igrejas vazia!',
}

export const NO_NEARBY_CHURCHES_FOUND_ERROR: IErrorDetail = {
  code: 'NO_NEARBY_CHURCHES_FOUND',
  message: 'Nenhuma igreja encontrada nas proximidades.',
}

export const CEP_TO_LAT_LON_ERROR: IErrorDetail = {
  code: 'CEP_TO_LAT_LON_FAILED',
  message: 'Falha ao processar o CEP',
}

