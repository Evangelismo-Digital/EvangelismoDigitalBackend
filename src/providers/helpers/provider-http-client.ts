import { AxiosInstance } from 'axios'
import { createHttpClient } from '@lib/http/axios'
import { SHARED_PROVIDER_DEFAULTS } from 'messages/constants/providers/shared'

/**
 * The Axios instance every external provider talks through.
 *
 * Each provider built its own, and each spelled out the same four connection
 * pool settings by hand — `KEEP_ALIVE_MSECS`, `MAX_SOCKETS`, `MAX_FREE_SOCKETS`,
 * `TIMEOUT_MS` — read from its own config constant, which in every case was
 * literally `SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT`. Five copies of a mapping
 * from one shared value to itself: ~28 duplicated lines, and five places to
 * edit if the pool is ever retuned.
 *
 * Providers that need more (Stadia's Authorization header, LocationIQ's default
 * params) pass it through `extra`, which is merged last.
 */
export interface ProviderHttpClientParams {
  baseURL?: string
  /** Request timeout. Distinct from the socket timeout in the agent options. */
  timeoutMs: number
  /**
   * Overrides the default `User-Agent`. Nominatim's usage policy requires a
   * contact address in it, which is why that one differs.
   */
  userAgent?: string
  /** Anything provider-specific: extra headers, default query params. */
  extra?: Record<string, unknown>
}

export function createProviderHttpClient(params: ProviderHttpClientParams): AxiosInstance {
  const { baseURL, timeoutMs, userAgent, extra } = params

  return createHttpClient({
    baseURL,
    timeout: timeoutMs,
    headers: {
      'User-Agent': userAgent ?? SHARED_PROVIDER_DEFAULTS.USER_AGENT,
    },
    agentOptions: {
      keepAliveMsecs: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.KEEP_ALIVE_MSECS,
      maxSockets: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.MAX_SOCKETS,
      maxFreeSockets: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.MAX_FREE_SOCKETS,
      timeout: SHARED_PROVIDER_DEFAULTS.HTTPS_AGENT.TIMEOUT_MS,
    },
    ...extra,
  })
}
