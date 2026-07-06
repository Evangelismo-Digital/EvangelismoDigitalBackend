export const SHARED_PROVIDER_DEFAULTS = {
  HTTPS_AGENT: {
    KEEP_ALIVE_MSECS: 1000,
    MAX_SOCKETS: 100,
    MAX_FREE_SOCKETS: 10,
    TIMEOUT_MS: 60_000,
  },
  USER_AGENT: 'EvangelismoDigitalBackend/1.0',
  USER_AGENT_WITH_CONTACT: 'EvangelismoDigitalBackend/1.0 (contact@findhope.digital)',
} as const
