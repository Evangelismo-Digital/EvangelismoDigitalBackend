import { Result } from 'core/shared/result'
import { AppError } from 'errors/app-error'

export enum EnumGeoPrecision {
  ROOFTOP = 'ROOFTOP',
  NEIGHBORHOOD = 'NEIGHBORHOOD',
  CITY = 'CITY',
  NO_CERTAINTY = 'NO_CERTAINTY',
}

export interface IGeoCoordinates {
  lat: number
  lon: number
  precision: EnumGeoPrecision
  providerName?: string
}

export interface IGeoSearchOptions {
  street?: string
  neighborhood?: string
  city: string
  state: string
  country: string
}

export enum EnumGeoCacheScope {
  SEARCH = 'search',
  SEARCH_STRUCTURED = 'searchStructured',
}

export interface IGeocodingProvider {
  search(query: string, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>>
  searchStructured(options: IGeoSearchOptions, signal?: AbortSignal): Promise<Result<IGeoCoordinates | null, AppError>>
}
