/**
 * Regression — D21: an error type read back from the cache could reach
 * `Object.prototype` and be *called*.
 *
 * WHAT BROKE
 * `deserializeAppError` looked its factory up with `AppErrorRegistry[type]`,
 * and `toHttpStatus` its status with `STATUS_MAP[type] ?? 500`. Both tables are
 * plain objects, so both inherited every member of `Object.prototype`. A `type`
 * of `"constructor"` therefore resolved to the `Object` function: truthy, so
 * `if (factory)` let it through, and non-null, so `?? 500` never fired.
 *
 * WHY IT MATTERED
 * `type` is not a constant. It is a field of the JSON envelope
 * `church-lookup-cache-policy` writes into Redis and reads back, so it is
 * untrusted input by the time it reaches either function. The registry then
 * called `Object(message)`, returning a boxed String that the signature
 * promises is an `AppError` — an object with no `type`, no `failureMode` and no
 * `body`, handed to code that unwraps all three. The status mapper returned a
 * *function* to `reply.code(...)`, throwing inside the global error handler,
 * the one place that must never throw.
 *
 * THE FIX
 * `safeLookup` (core/shared/safe-lookup.ts) asks `Object.hasOwn` first, so an
 * inherited key answers "not found" and both fallbacks work as written.
 *
 * Proven red: with `safeLookup` reverted to `table[key]`, the four
 * prototype-key cases below fail — `deserializeAppError` returns a String
 * object instead of `UnknownDeserializationError`, and `toHttpStatus` returns a
 * function instead of 500.
 */
import { describe, it, expect } from 'vitest'
import { deserializeAppError, serializeAppError, AppErrorRegistry } from './app-error-registry'
import { toHttpStatus } from './http-errors/http-error-status.mapper'
import { AppError } from './app-error'
import { ErrorType } from 'core/types/error-type/error-type'
import { InvalidCepError } from '@use-cases/errors/invalid-cep-error'

/** Members every plain object inherits, and that neither table declares. */
const INHERITED_KEYS = ['constructor', 'toString', 'valueOf', 'hasOwnProperty', 'isPrototypeOf']

describe('D21 — prototype chain reached through an error lookup', () => {
  describe('deserializeAppError', () => {
    it.each(INHERITED_KEYS)('does not treat the inherited "%s" as a registered factory', (key) => {
      const error = deserializeAppError(key, 'mensagem qualquer')

      // The contract is an AppError; before the fix this was a boxed String.
      expect(error).toBeInstanceOf(AppError)
      expect(error.body.code).toBe('UNKNOWN_DESERIALIZATION_ERROR')
    })

    it('does not let "__proto__" resolve to anything at all', () => {
      const error = deserializeAppError('__proto__', 'mensagem qualquer')

      expect(error).toBeInstanceOf(AppError)
      expect(error.body.code).toBe('UNKNOWN_DESERIALIZATION_ERROR')
    })

    // Counterweight: the guard must not have been tightened into a wall.
    it('still rebuilds every type the registry actually declares', () => {
      for (const type of Object.keys(AppErrorRegistry)) {
        const rebuilt = deserializeAppError(type, 'CEP 01310100 inválido')

        expect(rebuilt).toBeInstanceOf(AppError)
        expect(rebuilt.body.code).not.toBe('UNKNOWN_DESERIALIZATION_ERROR')
      }
    })

    // Counterweight: the round trip the cache policy actually performs.
    it('still survives a serialize -> deserialize round trip', () => {
      const original = new InvalidCepError('01310100')
      const { type, message, data } = serializeAppError(original)

      const rebuilt = deserializeAppError(type, message, data)

      expect(rebuilt).toBeInstanceOf(InvalidCepError)
      expect(rebuilt.failureMode).toBe(original.failureMode)
    })
  })

  describe('toHttpStatus', () => {
    it.each(INHERITED_KEYS)('falls back to 500 for the inherited "%s"', (key) => {
      const status = toHttpStatus(key as ErrorType)

      expect(typeof status).toBe('number')
      expect(status).toBe(500)
    })

    // Counterweight: every declared mapping still resolves to its own status.
    it('still maps every declared ErrorType to its own status', () => {
      expect(toHttpStatus(ErrorType.OK)).toBe(200)
      expect(toHttpStatus(ErrorType.NOT_FOUND)).toBe(404)
      expect(toHttpStatus(ErrorType.TOO_MANY_REQUESTS)).toBe(429)
      expect(toHttpStatus(ErrorType.SERVICE_UNAVAILABLE)).toBe(503)
      expect(toHttpStatus(ErrorType.INTERNAL_SERVER_ERROR)).toBe(500)
    })
  })
})
