export const LOCK_LOGS = {
  ACQUIRE_FAILED: 'Falha ao tentar adquirir Distributed Lock',
  RENEW_FAILED: 'Falha ao tentar renovar Distributed Lock',
  RENEW_EXPIRED: 'Distributed Lock não renovado: expirou ou pertence a outra instância',
  RELEASE_EXPIRED: 'Distributed Lock já havia expirado ou pertencia a outra instância no momento do release',
  RELEASE_FAILED: 'Falha ao liberar Distributed Lock (ele expirará sozinho pelo TTL)',
} as const
