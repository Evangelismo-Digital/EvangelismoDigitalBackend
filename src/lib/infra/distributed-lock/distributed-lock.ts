import { logger } from '@lib/logger'
import { getRedisCache } from '../../redis/clients/clients'
import { randomUUID } from 'node:crypto'

/**
 * Script Lua para release seguro.
 *
 * Garante atomicidade entre o GET (verificar owner) e o DEL:
 * sem isso, o lock poderia expirar e ser adquirido por outra instância
 * entre as duas operações, e o DEL deletaria o lock alheio.
 *
 * Retorna 1 se deletou (era o dono), 0 se a chave não existia ou
 * pertencia a outro dono.
 */
const RELEASE_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  else
    return 0
  end
`

/**
 * Script Lua para renew seguro.
 *
 * Renova o TTL APENAS se o valor armazenado corresponde ao token
 * do solicitante. Evita que uma instância que perdeu o lock
 * (por expiração) estenda inadvertidamente o lock de outra instância.
 *
 * Retorna 1 se renovou, 0 caso contrário.
 */
const RENEW_SCRIPT = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  else
    return 0
  end
`

export type LockToken = string

export class DistributedLock {
  /**
   * Tenta adquirir um lock exclusivo via SET NX PX (atômico).
   *
   * Gera um token UUID v4 único por aquisição e o armazena como valor da
   * chave Redis. Esse token é o "título de propriedade" do lock: apenas
   * quem o possui pode renová-lo ou liberá-lo.
   *
   * @param key    - Identificador único do recurso (ex: 'lock:outbox-processor')
   * @param ttlMs  - Tempo de vida inicial do lock em ms.
   *                 Serve como teto de segurança contra deadlock eterno em caso de crash.
   * @returns O token do lock se adquirido, null se já estava ocupado por outra instância.
   */
  static async acquire(key: string, ttlMs: number): Promise<LockToken | null> {
    const token = randomUUID()
    const redisCache = getRedisCache()

    try {
      const result = await redisCache.set(key, token, 'PX', ttlMs, 'NX')

      if (result !== 'OK') {
        return null
      }

      return token
    } catch (error) {
      logger.error({ error, key }, 'Falha ao tentar adquirir Distributed Lock')
      return null
    }
  }

  /**
   * Renova o TTL de um lock já adquirido (sliding TTL).
   *
   * Usa um script Lua para verificar atomicamente se o token ainda
   * pertence a esta instância antes de estender o TTL. Se o lock tiver
   * expirado e sido adquirido por outra instância, retorna false sem
   * alterar o estado do Redis.
   *
   * @param key    - A mesma chave usada no acquire
   * @param token  - O token retornado pelo acquire
   * @param ttlMs  - Novo TTL a partir de agora, em ms
   * @returns true se o lock ainda pertence a esta instância e foi renovado,
   *          false se o lock expirou ou foi assumido por outra instância.
   */
  static async renew(key: string, token: LockToken, ttlMs: number): Promise<boolean> {
    const redisCache = getRedisCache()

    try {
      const result = await redisCache.eval(RENEW_SCRIPT, 1, key, token, String(ttlMs))
      const renewed = result === 1

      if (!renewed) {
        logger.warn({ key }, 'Distributed Lock não renovado: expirou ou pertence a outra instância')
      }

      return renewed
    } catch (error) {
      logger.error({ error, key }, 'Falha ao tentar renovar Distributed Lock')
      return false
    }
  }

  /**
   * Libera o lock manualmente ao fim do trabalho.
   *
   * Usa um script Lua para garantir atomicidade entre a verificação do
   * owner e a deleção da chave. Se o lock já expirou e foi adquirido por
   * outra instância, o DEL não ocorre — protegendo o lock alheio.
   *
   * @param key   - A mesma chave usada no acquire
   * @param token - O token retornado pelo acquire
   */
  static async release(key: string, token: LockToken): Promise<void> {
    const redisCache = getRedisCache()

    try {
      const result = await redisCache.eval(RELEASE_SCRIPT, 1, key, token)

      if (result === 0) {
        // Não é necessariamente um erro: o lock pode ter expirado pelo TTL
        // antes do release manual (processo lento ou crash parcial).
        logger.warn({ key }, 'Distributed Lock já havia expirado ou pertencia a outra instância no momento do release')
      }
    } catch (error) {
      logger.warn({ error, key }, 'Falha ao liberar Distributed Lock (ele expirará sozinho pelo TTL)')
    }
  }
}
