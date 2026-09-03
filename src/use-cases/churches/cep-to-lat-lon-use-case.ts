import { CoordinatesNotFoundError } from '@use-cases/errors/coordinates-not-found-error'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'
import { logger } from '@lib/logger'
import { CepToLatLonError } from '@use-cases/errors/cep-to-lat-lon-error'
import {
  IGeocodingProvider,
  IGeoCoordinates,
  EnumGeoPrecision,
} from 'core/contracts/use-cases/providers/geo-provider.interface'
import { IAddressData, IAddressProvider } from 'core/contracts/use-cases/providers/address-provider.interface'
import { Result, ok, err, isErr } from 'core/shared/result'
import { AppError } from 'errors/app-error'
import { FailureMode } from 'core/types/failure-mode/failure-mode.enum'
import { CHURCH_CONSTANTS } from 'messages/constants/churches/churches'

interface CepToLatLonRequest {
  cep: string
  /**
   * Abort signal owned by the caller. This use-case holds no cache and
   * therefore no timeout budget of its own — it inherits the one enforced by
   * the single cache layer in FindNearestChurchesUseCase.
   */
  signal?: AbortSignal
}

interface CepToLatLonResponse {
  userLat: number
  userLon: number
  precision: string
  coordinatesProviderName?: string
}

/**
 * Outcome of a single geocoding strategy. `null` means "this strategy has no
 * answer, fall through to the next one"; a Result means the chain terminates,
 * either with coordinates or with an error worth surfacing.
 */
type StrategyOutcome = Result<CepToLatLonResponse, AppError> | null

export class CepToLatLonUseCase {
  constructor(
    private geocodingProvider: IGeocodingProvider,
    private addressProvider: IAddressProvider,
  ) {}

  async execute({ cep, signal }: CepToLatLonRequest): Promise<Result<CepToLatLonResponse, AppError>> {
    return await this.processCep(cep.replace(/\D/g, ''), signal)
  }

  private async processCep(cleanCep: string, signal?: AbortSignal): Promise<Result<CepToLatLonResponse, AppError>> {
    // 1. Fetch Address (ViaCEP / AwesomeAPI / BrasilAPI)
    const addrResult = await this.addressProvider.fetchAddress(cleanCep, signal)

    if (isErr(addrResult)) {
      return err(addrResult.error)
    }

    const address = addrResult.value

    if (!address) {
      return err(new InvalidCepError())
    }

    // 2. OPTIMIZATION: If the Address Provider (AwesomeAPI) gave us coordinates, USE THEM.
    const directCoordinates = this.mapAddressCoordinates(address)

    if (directCoordinates) {
      return ok(directCoordinates)
    }

    // 3. Geocoding Fallback Strategies, most precise first.
    return await this.geocodeAddress(cleanCep, address, signal)
  }

  /**
   * Some address providers (AwesomeAPI) already return coordinates, letting us
   * skip geocoding entirely. Returns null when they did not.
   */
  private mapAddressCoordinates(address: IAddressData): CepToLatLonResponse | null {
    if (!address.lat || !address.lon) {
      return null
    }

    return {
      userLat: address.lat,
      userLon: address.lon,
      precision: address.precision ?? EnumGeoPrecision.NO_CERTAINTY,
      coordinatesProviderName: address.providerName ?? CHURCH_CONSTANTS.UNKNOWN_PROVIDER,
    }
  }

  private async geocodeAddress(
    cleanCep: string,
    address: IAddressData,
    signal?: AbortSignal,
  ): Promise<Result<CepToLatLonResponse, AppError>> {
    const strategies = [
      () => this.searchByStreet(address, signal),
      () => this.searchByNeighborhood(address, signal),
      () => this.searchByCity(address, signal),
    ]

    for (const runStrategy of strategies) {
      const outcome = await runStrategy()

      if (outcome) {
        return outcome
      }
    }

    // 4. PARANOID GUARD
    logger.error({ cep: cleanCep, city: address.localidade }, 'Crítico: Geocoding Provider não encontrou a cidade.')

    // This is a system error
    return err(new CepToLatLonError(cleanCep))
  }

  /** Strategy A: Exact Match (Street) */
  private async searchByStreet(address: IAddressData, signal?: AbortSignal): Promise<StrategyOutcome> {
    const { logradouro, localidade, uf } = address

    if (!logradouro) {
      return null
    }

    const result = await this.geocodingProvider.search(
      `${logradouro}, ${localidade} - ${uf}, ${CHURCH_CONSTANTS.GEOCODING_COUNTRY}`,
      signal,
    )

    return this.interpretSearch(result)
  }

  /** Strategy B: Approximate Match (Neighborhood) */
  private async searchByNeighborhood(address: IAddressData, signal?: AbortSignal): Promise<StrategyOutcome> {
    const { bairro, localidade, uf } = address

    if (!bairro) {
      return null
    }

    const result = await this.geocodingProvider.search(
      `${bairro}, ${localidade} - ${uf}, ${CHURCH_CONSTANTS.GEOCODING_COUNTRY}`,
      signal,
    )

    return this.interpretSearch(result)
  }

  /**
   * Strategy C: City Fallback. Unlike A and B this is the last resort, so an
   * empty result is a definitive CoordinatesNotFoundError rather than a
   * fall-through.
   */
  private async searchByCity(address: IAddressData, signal?: AbortSignal): Promise<StrategyOutcome> {
    const { localidade, uf } = address

    if (!localidade) {
      return null
    }

    const result = await this.geocodingProvider.searchStructured(
      {
        city: localidade,
        state: uf,
        country: CHURCH_CONSTANTS.GEOCODING_COUNTRY,
      },
      signal,
    )

    if (isErr(result)) {
      return err(result.error)
    }

    return result.value ? ok(this.mapResponse(result.value)) : err(new CoordinatesNotFoundError())
  }

  /**
   * A hit terminates the chain; a NOT_FOUND (or empty) result falls through to
   * the next strategy; anything else is a real failure worth surfacing.
   */
  private interpretSearch(result: Result<IGeoCoordinates | null, AppError>): StrategyOutcome {
    if (isErr(result)) {
      return result.error.failureMode === FailureMode.NOT_FOUND ? null : err(result.error)
    }

    return result.value ? ok(this.mapResponse(result.value)) : null
  }

  private mapResponse(coords: IGeoCoordinates): CepToLatLonResponse {
    return {
      userLat: coords.lat,
      userLon: coords.lon,
      precision: coords.precision,
      coordinatesProviderName: coords.providerName,
    }
  }
}
