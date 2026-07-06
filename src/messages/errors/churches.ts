import { IErrorDetail } from 'core/contracts/errors/error-detail.interface'

export const CHURCH_ERRORS = {
  NOT_FOUND: {
    code: 'CHURCH_NOT_FOUND',
    message: 'Igreja não encontrada.',
  },
  ALREADY_EXISTS: {
    code: 'CHURCH_ALREADY_EXISTS',
    message: 'Já existe uma igreja cadastrada com este nome e/ou coordenadas',
  },
  INVALID_CEP: {
    code: 'INVALID_CEP',
    message: 'O CEP fornecido não existe.',
  },
  COORDINATES_NOT_FOUND: {
    code: 'COORDINATES_NOT_FOUND',
    message: 'Coordenadas não encontradas para o endereço fornecido.',
  },
  NO_ADDRESS_PROVIDED: {
    code: 'NO_ADDRESS_PROVIDED',
    message: 'Nenhum endereço fornecido para conversão de CEP.',
  },
  LATITUDE_OUT_OF_RANGE: {
    code: 'LATITUDE_OUT_OF_RANGE',
    message: 'A Latitude deve estar entre -90 e 90 graus.',
  },
  LONGITUDE_OUT_OF_RANGE: {
    code: 'LONGITUDE_OUT_OF_RANGE',
    message: 'A longitude deve estar entre -180 e 180 graus.',
  },
  CREATE_FAILED: {
    code: 'CREATE_CHURCH_FAILED',
    message: 'Falha ao criar a igreja.',
  },
  EMPTY_LIST: {
    code: 'EMPTY_CHURCH_LIST',
    message: 'Lista de igrejas vazia!',
  },
  NO_NEARBY_FOUND: {
    code: 'NO_NEARBY_CHURCHES_FOUND',
    message: 'Nenhuma igreja encontrada nas proximidades.',
  },
  CEP_TO_LAT_LON_FAILED: {
    code: 'CEP_TO_LAT_LON_FAILED',
    message: 'Falha ao processar o CEP',
  },
} as const satisfies Record<string, IErrorDetail>

export const INVALID_CEP_ERROR_FN = (cep?: string): IErrorDetail => ({
  code: 'INVALID_CEP',
  message: cep ? `O CEP fornecido ${cep} não existe.` : 'O CEP fornecido não existe.',
})
