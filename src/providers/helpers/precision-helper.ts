import { IAddressData } from 'core/contracts/use-cases/providers/address-provider.interface'
import { EnumGeoPrecision } from 'core/contracts/use-cases/providers/geo-provider.interface'

// Tipagem flexível para aceitar dados brutos do Nominatim/LocationIQ
interface OsmRawData {
  place_rank?: string | number
  type?: string
  class?: string // 'class' pode vir da API, apesar de ser reservado no JS
  addresstype?: string
}

export class PrecisionHelper {
  /**
   * Estratégia para provedores baseados em OpenStreetMap (Nominatim, LocationIQ)
   */
  static fromOsm(data: OsmRawData): EnumGeoPrecision {
    const rank = Number(data.place_rank) || 0

    // Rank 30 = endereço exato com número; 26-29 = rua/estrada.
    if (rank >= ROOFTOP_MIN_RANK || isRooftopPlace(data)) {
      return EnumGeoPrecision.ROOFTOP
    }

    // Rank 16-25 = vilas, bairros, distritos.
    if (rank >= NEIGHBORHOOD_MIN_RANK || isNeighborhoodPlace(data)) {
      return EnumGeoPrecision.NEIGHBORHOOD
    }

    // Rank < 16 = cidades, estados, países.
    return EnumGeoPrecision.CITY
  }

  /**
   * Estratégia para provedores de CEP (AwesomeAPI, ViaCEP)
   * Baseada na presença de campos.
   */
  static fromAddressData(data: Partial<IAddressData>): EnumGeoPrecision {
    // Se tem logradouro (nome da rua), consideramos precisão alta (nível de rua)
    if (data.logradouro && data.logradouro.trim() !== '') {
      return EnumGeoPrecision.ROOFTOP
    }

    // Se não tem rua, mas tem bairro, é precisão média
    if (data.bairro && data.bairro.trim() !== '') {
      return EnumGeoPrecision.NEIGHBORHOOD
    }

    // Se só tem cidade/estado, é precisão baixa
    return EnumGeoPrecision.CITY
  }
}

const ROOFTOP_MIN_RANK = 26
const NEIGHBORHOOD_MIN_RANK = 16

const ROOFTOP_TYPES = ['house', 'building', 'residential', 'apartments', 'commercial']
/** `class` in the OSM payload generally maps to the category. */
const ROOFTOP_CATEGORIES = ['highway', 'secondary', 'primary', 'road']
const NEIGHBORHOOD_TYPES = ['neighbourhood', 'suburb', 'quarter', 'hamlet', 'district']

function isRooftopPlace(data: OsmRawData): boolean {
  return ROOFTOP_TYPES.includes(data.type || '') || ROOFTOP_CATEGORIES.includes(data.class || '')
}

function isNeighborhoodPlace(data: OsmRawData): boolean {
  return NEIGHBORHOOD_TYPES.includes(data.type || '') || data.addresstype === 'suburb'
}
