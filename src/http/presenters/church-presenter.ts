import { Church, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'
import { PublicNearbyChurch, toPublicNearbyChurch } from 'core/projections/public-church'

type HTTPChurch = {
  publicId: string
  name: string
  address: string
  lat: number
  lon: number
  geog: unknown
  createdAt: Date
  updatedAt: Date
}

/**
 * Identical to the domain projection, by definition: what this API exposes for
 * a nearby church IS what the domain permits to be disclosed. Aliased rather
 * than restated so the two cannot drift.
 */
type HTTPNearbyChurch = PublicNearbyChurch

export class ChurchPresenter {
  static toHTTP(church: Church): HTTPChurch
  static toHTTP(churches: Church[]): HTTPChurch[]
  static toHTTP(church: NearbyChurch): HTTPNearbyChurch
  static toHTTP(churches: NearbyChurch[]): HTTPNearbyChurch[]
  static toHTTP(
    input: Church | Church[] | NearbyChurch | NearbyChurch[],
  ): HTTPChurch | HTTPChurch[] | HTTPNearbyChurch | HTTPNearbyChurch[] {
    if (Array.isArray(input)) {
      return input.map((c) => (isNearby(c) ? toHTTPNearby(c) : toHTTPChurch(c))) as HTTPChurch[] | HTTPNearbyChurch[]
    }

    return isNearby(input) ? toHTTPNearby(input) : toHTTPChurch(input)
  }
}

/** A nearby church is a church plus its two distance fields. */
function isNearby(input: Church | NearbyChurch): input is NearbyChurch {
  return 'distanceKm' in input && 'distanceMeters' in input
}

const toHTTPNearby = toPublicNearbyChurch

function toHTTPChurch(input: Church): HTTPChurch {
  return {
    publicId: input.publicId,
    name: input.name,
    address: input.address,
    lat: input.lat,
    lon: input.lon,
    geog: input.geog,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  }
}
