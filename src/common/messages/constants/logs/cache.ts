export const CACHE_LOGS = {
  READ_ERROR: 'Erro de leitura ou falha do Redis. Continuando sem cache.',
  WRITE_ERROR: 'Falha ao escrever no Redis (não fatal, continuando)',
  CORRUPTED_ENVELOPE: 'Cache corrompida detectada: CacheEnvelope de sucesso sem valor',
  TTL_SKIP: 'TTL <= 0, pulando escrita no cache',
} as const
