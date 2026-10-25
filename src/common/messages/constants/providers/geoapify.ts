export const GEOAPIFY_CONFIG = {
  DEFAULT_TIMEOUT_MS: 3_000,
  // Two attempts, matching OpenRouteService and the address/geocoding providers.
  MAX_RETRIES: 2,
  BACKOFF_MS: 200,
  // Geoapify answers in meters under `metric`; the provider converts to km.
  UNITS: 'metric',
  METERS_PER_KM: 1000,
  CONTENT_TYPE: 'application/json',
} as const
