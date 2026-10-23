// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { addAbortListener } from 'node:events'

/**
 * Um motivo de abort pode ser qualquer valor; quem recebe sempre precisa de um
 * Error com mensagem legível.
 *
 * Sem ramo especial para string: `new Error(reason)` e `new Error(String(reason))`
 * produzem exatamente o mesmo Error quando `reason` já é uma string, então o
 * atalho era código redundante — e quatro mutantes equivalentes no relatório.
 */
const toError = (reason: unknown): Error => {
  if (reason instanceof Error) return reason
  return new Error(String(reason))
}

const resolveAbort = <T>(
  onAbort: () => T | Promise<T>,
  resolve: (value: T) => void,
  reject: (reason: unknown) => void,
): void => {
  try {
    Promise.resolve(onAbort()).then(resolve, reject)
  } catch (reason) {
    reject(reason)
  }
}

const resolveIfAlreadyAborted = <T>(signal: AbortSignal, onAbort: () => T | Promise<T>): Promise<T> | undefined => {
  if (!signal.aborted) return undefined
  try {
    return Promise.resolve(onAbort())
  } catch (reason) {
    return Promise.reject(toError(reason))
  }
}

/**
 * Races a promise against an AbortSignal, cleaning up the listener as soon as
 * the promise settles. If the signal fires first, returns or throws what
 * `onAbort` provides.
 *
 * Mutation note — sete mutantes sobrevivem aqui, todos equivalentes, e a razão
 * é a mesma nos dois grupos:
 *
 *  - `resolveIfAlreadyAborted` (o atalho para sinal já abortado) pode ser
 *    esvaziado sem mudar resultado: sem ele a corrida completa é montada e o
 *    `addAbortListener` dispara de imediato num sinal já abortado, entregando o
 *    mesmo valor um microtask depois. O atalho é otimização, não semântica —
 *    e desde a correção da rejeição órfã os dois caminhos consomem a promise
 *    abandonada.
 *  - As guardas `settled` restantes (atribuições em `onResolve`/`onReject` e o
 *    teste dentro do listener) ficam inobserváveis porque `disposable` remove o
 *    listener no mesmo instante em que a promise se resolve, e resolver ou
 *    rejeitar uma promise já estabelecida é no-op. O caso em que a guarda É
 *    observável — `onAbort` assíncrono com a promise se resolvendo durante a
 *    espera — tem teste próprio e mata os mutantes correspondentes.
 */
export function abortRace<T>(promise: Promise<T>, signal: AbortSignal, onAbort: () => T | Promise<T>): Promise<T> {
  const aborted = resolveIfAlreadyAborted(signal, onAbort)
  if (aborted) {
    // The racing promise is abandoned here, but it is still in flight, and
    // nothing below ever attaches to it on this path. Without this handler its
    // eventual rejection is reported as an unhandledRejection — which the
    // worker treats as fatal — for a result the caller already stopped waiting
    // for. The listener path keeps the same guarantee through `onReject`.
    promise.catch(() => undefined)
    return aborted
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const onResolve = (val: T) => {
      if (settled) return
      settled = true
      disposable[Symbol.dispose]()
      resolve(val)
    }
    const onReject = (err: unknown) => {
      if (settled) return
      settled = true
      disposable[Symbol.dispose]()
      reject(toError(err))
    }
    const disposable = addAbortListener(signal, () => {
      if (settled) return
      settled = true
      resolveAbort(onAbort, resolve, (reason) => {
        reject(toError(reason))
      })
    })
    promise.then(onResolve, onReject)
  })
}
