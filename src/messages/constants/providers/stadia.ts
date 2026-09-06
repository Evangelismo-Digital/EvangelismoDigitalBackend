export const STADIA_CONFIG = {
  DEFAULT_TIMEOUT_MS: 3_000,
  // Two attempts, matching the address and geocoding providers. Recovers a
  // transient blip without softening the recorded "routing fails hard" decision:
  // there is still no second routing provider to fall back to.
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  AUTH_PREFIX: 'Stadia-Auth',
  UNITS: 'kilometers',
  CONTENT_TYPE: 'application/json',
} as const
