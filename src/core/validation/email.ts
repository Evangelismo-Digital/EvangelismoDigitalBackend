import z from 'zod'

/**
 * What this system accepts as an e-mail address, and how it normalises one.
 *
 * It lives in `core` rather than under `http/schemas` because it is not a
 * property of the HTTP layer: `AuthenticateUserUseCase` uses it to decide
 * whether a login string is an address or a username, and `ForgotPasswordUseCase`
 * uses it to reject a malformed address before touching the repository. Both are
 * domain decisions, and reaching into `@http/schemas` for them made two
 * use-cases depend on the transport — an inward-pointing dependency inverted.
 *
 * The HTTP request schemas import it from here too, which is the direction the
 * architecture expects: outer layers depend on the core, never the reverse.
 */
export const emailSchema = z.email().transform((email) => email.toLowerCase())
