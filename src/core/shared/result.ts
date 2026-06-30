import { ResultPattern } from 'core/types/patterns/result-pattern'

type ResultSuccess<T> = { success: true; value: T }
type ResultFailure<E> = { success: false; error: E }

export type Result<T, E = Error> = ResultPattern<ResultSuccess<T>, ResultFailure<E>>

export const ok = <T>(value: T): Result<T, never> => ({
  success: true,
  value,
})

export const err = <E>(error: E): Result<never, E> => ({
  success: false,
  error,
})

export function isOk<T, E>(result: Result<T, E>): result is ResultSuccess<T> {
  return result.success
}

export function isErr<T, E>(result: Result<T, E>): result is ResultFailure<E> {
  return !result.success
}
