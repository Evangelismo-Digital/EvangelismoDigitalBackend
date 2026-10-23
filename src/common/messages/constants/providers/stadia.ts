export const STADIA_CONFIG = {
  DEFAULT_TIMEOUT_MS: 3_000,
  // Two attempts, matching the address and geocoding providers. Recovers a
  // transient blip before the chain falls through to OpenRouteService.
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  AUTH_PREFIX: 'Stadia-Auth',
  UNITS: 'kilometers',
  CONTENT_TYPE: 'application/json',
} as const
