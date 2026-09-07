import Redis from 'ioredis'
import { RateLimiterRedis } from 'rate-limiter-flexible' // Lib utilizada para implementar o rate-limiter com Redis
import { logger } from '@lib/logger'
import { REDIS_CONSTANTS } from 'messages/constants/redis/redis'
import { RATE_LIMITER_LOGS } from 'messages/constants/logs/rate-limiter'
import { safeLookup } from 'core/shared/safe-lookup'
import { asLoggableError, DEFAULT_OUTAGE_WARN_INTERVAL_MS, OutageReporter } from './outage-reporter'
import {
  collectMetricsRateLimiterConsumed,
  collectMetricsRateLimiterRejected,
  collectMetricsRateLimiterInfraDegraded,
  collectMetricsRateLimiterInfraRecovered,
} from '@lib/metrics/rate-limiter-metrics'

/**
 * Providers are a fixed set of literals in the code, so the map should settle
 * at a handful of entries. Passing this means something is keying limiters by
 * something dynamic — a leak that grows with traffic.
 */
const LIMITER_COUNT_WARN_THRESHOLD = 50

/** Applied to a provider with no entry in the table: deliberately restrictive. */
const DEFAULT_PROVIDER_LIMIT = { points: 10, windowSeconds: 1 }

const RATE_LIMITER_OUTAGE_WARN_INTERVAL_MS = Number(
  process.env.REDIS_LOG_OUTAGE_INTERVAL_MS ?? DEFAULT_OUTAGE_WARN_INTERVAL_MS,
)

/**
 * DESIGN DECISION — Rate Limiting Strategy
 *
 * Este rate-limiter foi projetado para proteger APIs externas (3rd-party),
 * onde exceder o limite pode gerar bloqueios, custos financeiros ou
 * interrupção do serviço.
 *
 * ❌ Por que NÃO usamos fallback em memória (RateLimiterMemory / insuranceLimiter):
 * - Fallback em memória cria um comportamento "fail-open" em ambientes distribuídos.
 * - Em caso de indisponibilidade do Redis, cada instância/pod aplicaria o limite
 *   localmente, permitindo bursts globais e potencialmente excedendo o limite real
 *   da API externa.
 * - É possível dividir o limite total de cada provider pela quantidade de instâncias,
 *   mas isso adiciona complexidade e ainda não elimina o risco de estouro.
 * - Para APIs externas, é preferível falhar fechado (fail-closed), protegendo o
 *   provider mesmo que isso implique negar temporariamente requisições internas.
 *
 * ✔️ Estratégia adotada:
 * - Redis é a única fonte de verdade para o rate-limit.
 * - Em falhas de Redis (infra), adota fail-open temporário para preservar disponibilidade.
 * - Limite explícito continua quando Redis está disponível.
 *
 * 🔧 Por que rate-limiter-flexible:
 * - Implementação madura e amplamente testada em produção.
 * - Suporte nativo a Redis com operações atômicas (Lua scripts).
 * - Seguro para ambientes distribuídos (sem race conditions).
 * - API simples e explícita (consume / remainingPoints).
 * - Evita implementações manuais propensas a bugs, memory leaks e estados inválidos.
 *
 * Observação importante:
 * - Este rate-limiter é GLOBAL por provider (consumerKey = 'global').
 * - O parâmetro "provider" DEVE ser uma string estática.
 * - Nunca use identificadores dinâmicos (ex: userId) como provider,
 *   pois isso causaria crescimento não controlado de memória.
 */

/**
 * Configuração fixa de Rate Limit por Provider.
 * Essas configs DEVEM ser estáticas.
 */
type ProviderRateLimitConfig = {
  points: number
  windowSeconds: number
}

export enum EnumProviderConfig {
  AWESOME_API_ADDRESS = 'awesomeApiAddressProvider',
  VIACEP_ADDRESS = 'viacepAddressProvider',
  BRASIL_API_ADDRESS = 'brasilApiAddressProvider',
  NOMINATIM_GEOCODING = 'nominatimGeocodingProvider',
  LOCATION_IQ_GEOCODING = 'locationIqGeocodingProvider',
  STADIA_ROUTING = 'stadiaRoutingProvider',
}

/**
 * `rate-limiter-flexible` signals "over the limit" by rejecting with a
 * RateLimiterRes carrying `remainingPoints`, and signals a Redis outage by
 * rejecting with an actual Error. Only the shape tells them apart.
 */
function isRateLimitRejection(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'remainingPoints' in error &&
    typeof (error as Record<string, unknown>).remainingPoints === 'number'
  )
}

export class RedisRateLimiter {
  private static instance: RedisRateLimiter | null

  /**
   * One episode across every provider: a Redis outage is an outage, and six
   * providers noticing it separately would be six alarms for one fact.
   */
  private static readonly outage = new OutageReporter({
    messages: {
      degraded: RATE_LIMITER_LOGS.INFRA_DEGRADED,
      stillDegraded: RATE_LIMITER_LOGS.INFRA_STILL_DEGRADED,
      recovered: RATE_LIMITER_LOGS.INFRA_RECOVERED,
    },
    warnIntervalMs: RATE_LIMITER_OUTAGE_WARN_INTERVAL_MS,
    onDegraded: ({ provider }) => collectMetricsRateLimiterInfraDegraded?.inc({ provider: String(provider) }),
    onRecovered: ({ provider }) => collectMetricsRateLimiterInfraRecovered?.inc({ provider: String(provider) }),
  })

  private readonly redis: Redis

  // 1 limiter por provider
  private readonly limiters = new Map<EnumProviderConfig, RateLimiterRedis>()

  /**
   * Central de configuração dos providers
   */
  private readonly providerConfigs: Record<EnumProviderConfig, ProviderRateLimitConfig> = {
    [EnumProviderConfig.AWESOME_API_ADDRESS]: {
      points: 5,
      windowSeconds: 1,
    },
    [EnumProviderConfig.VIACEP_ADDRESS]: {
      points: 1,
      windowSeconds: 1,
    },
    [EnumProviderConfig.BRASIL_API_ADDRESS]: {
      points: 5,
      windowSeconds: 1,
    },
    [EnumProviderConfig.NOMINATIM_GEOCODING]: {
      points: 1,
      windowSeconds: 1,
    },
    [EnumProviderConfig.LOCATION_IQ_GEOCODING]: {
      points: 2,
      windowSeconds: 1,
    },
    [EnumProviderConfig.STADIA_ROUTING]: {
      points: 50,
      windowSeconds: 1,
    },
  }

  private constructor(redis: Redis) {
    this.redis = redis
  }

  static getInstance(redis: Redis): RedisRateLimiter {
    // Singleton com Redis injetado externamente através da lib RedisRateLimiter
    this.instance ??= new RedisRateLimiter(redis)

    return this.instance
  }

  /**
   * Retorna ou cria um RateLimiter para o provider.
   * ❗ Provider PRECISA existir em providerConfigs.
   */
  private getLimiter(provider: EnumProviderConfig): RateLimiterRedis {
    // safeLookup, not `this.providerConfigs[provider]`: a Record's index
    // signature promises a value for every key, so the `||` fallback read as
    // dead code while being the only thing standing between an unconfigured
    // provider and `undefined.points`.
    const config = safeLookup(this.providerConfigs, provider) ?? DEFAULT_PROVIDER_LIMIT

    const existingLimiter = this.limiters.get(provider)
    if (existingLimiter) {
      return existingLimiter
    }

    const limiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: `${REDIS_CONSTANTS.KEYS.RATE_LIMIT_PREFIX}${provider}`,
      points: config.points,
      duration: config.windowSeconds,
      execEvenly: false,
      blockDuration: 0,
    })

    this.limiters.set(provider, limiter)

    // Observabilidade defensiva
    if (this.limiters.size > LIMITER_COUNT_WARN_THRESHOLD) {
      logger.warn(
        { size: this.limiters.size },
        'ALERTA: Muitos RateLimiters instanciados. Verifique se providers estão estáticos.',
      )
    }

    return limiter
  }

  /**
   * Consome 1 ponto do Rate Limit do provider.
   * Bucket GLOBAL compartilhado por todas as instâncias.
   */
  async tryConsume(provider: EnumProviderConfig): Promise<boolean> {
    const CONSUMER_KEY = 'global' // Rate Limit GLOBAL por provider

    try {
      const limiter = this.getLimiter(provider)

      await limiter.consume(CONSUMER_KEY, 1)

      collectMetricsRateLimiterConsumed?.inc({ provider })

      RedisRateLimiter.outage.succeeded({ provider })

      return true
    } catch (error) {
      if (isRateLimitRejection(error)) {
        collectMetricsRateLimiterRejected?.inc({ provider })

        return false
      }

      // Conta cada requisição liberada em fail-open (Redis indisponível). A
      // métrica NÃO é suprimida como o log — cada requisição permitida é um
      // evento de fail-open. Quem decide isso é o OutageReporter.
      RedisRateLimiter.outage.failed({ provider }, asLoggableError(error))

      return true
    }
  }

  static destroyInstance() {
    // Drop the outage episode with the instance. Left open, it would suppress the
    // *first* warning of the next outage — the one that says an outage started.
    this.outage.reset()

    if (!this.instance) {
      logger.debug(RATE_LIMITER_LOGS.NO_INSTANCE_TO_DESTROY)
      return
    }

    this.instance.destroyRateLimiterMap()

    this.instance = null
  }

  private destroyRateLimiterMap() {
    for (const [provider] of this.limiters.entries()) {
      logger.debug({ provider }, 'Limpando RateLimiter do provider.')
    }

    this.limiters.clear()
  }
}
