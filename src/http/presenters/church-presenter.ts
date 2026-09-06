import { Church, NearbyChurch } from 'core/contracts/repository/churches-repository.interface'

type HTTPChurch = {
  publicId: string
  name: string
  address: string
  lat: number
  lon: number
  geog: unknown | null
  createdAt: Date
  updatedAt: Date
}

type HTTPNearbyChurch = {
  publicId: string
  name: string
  address: string | null
  lat: number
  lon: number
  distanceKm: number
  distanceMeters: number
}

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

function toHTTPNearby(input: NearbyChurch): HTTPNearbyChurch {
  return {
    publicId: input.publicId,
    name: input.name,
    address: input.address,
    lat: input.lat,
    lon: input.lon,
    distanceKm: input.distanceKm,
    distanceMeters: input.distanceMeters,
  }
}

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
