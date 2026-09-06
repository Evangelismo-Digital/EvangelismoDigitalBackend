import { circuitBreaker, handleWhen, SamplingBreaker, CircuitBreakerPolicy } from 'cockatiel'
import { env } from '@env/index'
import { isRetryableFailure } from './retryable-failure'

/**
 * One breaker per provider, reused across every request.
 *
 * This memoisation *is* the feature. A breaker built per call would observe a
 * single request, never accumulate a failure rate, and never open — it would be
 * pure overhead dressed up as resilience. The map is process-wide and
 * deliberately unbounded in the same way the provider list is: keys come from
 * `providerName`, a fixed set of literals in the code, never from user input.
 */
const breakers = new Map<string, CircuitBreakerPolicy>()

/**
 * The breaker guarding `providerName`, or `undefined` when breaking is switched
 * off.
 *
 * Disabled means the policy stack is *composed* without a breaker rather than
 * consulting a flag on every call, so the switch costs nothing on the hot path.
 */
export function getProviderCircuitBreaker(providerName: string): CircuitBreakerPolicy | undefined {
  if (!env.CIRCUIT_BREAKER_ENABLED) {
    return undefined
  }

  const existing = breakers.get(providerName)

  if (existing) {
    return existing
  }

  const created = createBreaker()
  breakers.set(providerName, created)

  return created
}

/**
 * A sampling breaker, not a consecutive one: providers here fail intermittently
 * under load, and "three in a row" would open on noise that a failure *rate*
 * correctly ignores. `minimumRps` keeps a single failure in a quiet period from
 * suspending a provider for everyone.
 */
function createBreaker(): CircuitBreakerPolicy {
  return circuitBreaker(handleWhen(isRetryableFailure), {
    halfOpenAfter: env.CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
    breaker: new SamplingBreaker({
      threshold: env.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
      duration: env.CIRCUIT_BREAKER_SAMPLING_WINDOW_MS,
      minimumRps: env.CIRCUIT_BREAKER_MIN_THROUGHPUT,
    }),
  })
}

/**
 * Drops every remembered breaker.
 *
 * Breaker state is process-wide by design, which makes it leak between test
 * cases unless they can reset it — a suite that opened a circuit would
 * otherwise poison every later test for the same provider.
 */
export function resetProviderCircuitBreakers(): void {
  breakers.clear()
}
