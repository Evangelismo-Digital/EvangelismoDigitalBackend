import '@fastify/jwt'
import { UserRole } from 'core/contracts/repository/users-repository.interface'

declare module '@fastify/jwt' {
  export interface FastifyJWT {
    /**
     * The DECODED payload of a token we received — not a value this process
     * constructed. Everything past `sub` is optional on purpose: a token
     * issued before a claim existed, or by a different service, simply will
     * not carry it, and declaring `role` as always present made the
     * authorisation guard in verify-user-role.middleware look redundant to
     * static analysis while being the only thing enforcing it.
     */
    user: {
      sub: string
      role?: UserRole
      publicId?: string
    }
  }
}
