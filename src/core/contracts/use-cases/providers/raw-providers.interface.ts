import { IAddressData } from './address-provider.interface'
import { IGeoCoordinates, IGeoSearchOptions } from './geo-provider.interface'
import { RoutingPoint, RouteDistanceResult } from './church-routing-provider.interface'
import { EnumProviderConfig } from '@lib/infra/rate-limiter/redis-rate-limiter'
import { RoutingProfile } from 'core/types/routing-profile/routing-profile-enum'

export interface IRawAddressProvider {
  readonly providerName: string
  readonly rateLimitConfig: EnumProviderConfig
  readonly maxRetries: number
  readonly backoffMs: number
  /** Per-call ceiling. The decorator narrows it to the remaining budget. */
  readonly timeoutMs: number
  fetchRawAddress(cep: string, signal?: AbortSignal): Promise<IAddressData | null>
}

export interface IRawGeocodingProvider {
  readonly providerName: string
  readonly rateLimitConfig: EnumProviderConfig
  readonly maxRetries: number
  readonly backoffMs: number
  /** Per-call ceiling. The decorator narrows it to the remaining budget. */
  readonly timeoutMs: number
  searchRaw(query: string, signal?: AbortSignal): Promise<IGeoCoordinates | null>
  searchStructuredRaw(options: IGeoSearchOptions, signal?: AbortSignal): Promise<IGeoCoordinates | null>
}

export interface IRawChurchRoutingProvider {
  readonly providerName: string
  readonly rateLimitConfig: EnumProviderConfig
  /** Per-call ceiling. The decorator narrows it to the remaining budget. */
  readonly timeoutMs: number
  readonly maxRetries: number
  readonly backoffMs: number
  readonly defaultCosting?: RoutingProfile
  fetchRawDistances(
    origin: RoutingPoint,
    destinations: RoutingPoint[],
    profile?: RoutingProfile,
    signal?: AbortSignal,
  ): Promise<RouteDistanceResult[]>
}
