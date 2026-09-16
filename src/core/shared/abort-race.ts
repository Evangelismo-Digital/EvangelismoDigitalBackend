// eslint-disable-next-line n/no-unsupported-features/node-builtins
import { addAbortListener } from 'node:events'

/**
 * Races a promise against an AbortSignal, cleaning up the listener as soon as
 * the promise settles. If the signal fires first, returns or throws what
 * `onAbort` provides.
 */
export function abortRace<T>(promise: Promise<T>, signal: AbortSignal, onAbort: () => T | Promise<T>): Promise<T> {
  if (signal.aborted) {
    try {
      return Promise.resolve(onAbort())
    } catch (err) {
      return Promise.reject(err)
    }
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false

    const disposable = addAbortListener(signal, () => {
      if (settled) return
      settled = true
      try {
        Promise.resolve(onAbort()).then(resolve, reject)
      } catch (err) {
        reject(err)
      }
    })

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
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      reject(err)
    }

    promise.then(onResolve, onReject)
  })
}
