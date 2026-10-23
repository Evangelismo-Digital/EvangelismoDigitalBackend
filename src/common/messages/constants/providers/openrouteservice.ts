export const OPENROUTESERVICE_CONFIG = {
  DEFAULT_TIMEOUT_MS: 3_000,
  // Two attempts, matching Stadia and the address/geocoding providers.
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  UNITS: 'km',
  METRICS: ['distance'],
  CONTENT_TYPE: 'application/json',
} as const
