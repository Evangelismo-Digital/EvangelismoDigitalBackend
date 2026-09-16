// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { addAbortListener } from 'node:events'

const toError = (reason: unknown): Error => {
  if (reason instanceof Error) return reason
  if (typeof reason === 'string') return new Error(reason)
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
 */
export function abortRace<T>(promise: Promise<T>, signal: AbortSignal, onAbort: () => T | Promise<T>): Promise<T> {
  const aborted = resolveIfAlreadyAborted(signal, onAbort)
  if (aborted) return aborted
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
