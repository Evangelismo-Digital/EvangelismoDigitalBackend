import { defineConfig } from 'prisma/config'
import 'dotenv/config'

// Fallback só para comandos da CLI que não conectam (generate/validate) em
// ambientes sem env (job static do CI). O TLD .invalid nunca resolve (RFC 6761):
// qualquer comando que tente conectar falha imediatamente com erro claro, em vez
// de atingir silenciosamente um banco real em localhost.
const fallbackDatabaseUrl = 'postgresql://placeholder:placeholder@prisma-cli-placeholder.invalid:5432/placeholder'

/** Treats a declared-but-blank `FOO=` as absent, matching `src/env/optional-env`. */
function blankAsUnset(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // `blankAsUnset`, not `??`: an empty string is not nullish, so a blanked-out
    // `DATABASE_URL_LOCAL=` did NOT fall through to `DATABASE_URL` — it handed
    // Prisma an empty URL. Blanking a variable is how an operator disables one,
    // and this file cannot lean on the Zod normalisation in `src/env` because it
    // deliberately does not import it (see the note above).
    url: blankAsUnset(process.env.DATABASE_URL_LOCAL) ?? blankAsUnset(process.env.DATABASE_URL) ?? fallbackDatabaseUrl,
    shadowDatabaseUrl: blankAsUnset(process.env.SHADOW_DATABASE_URL),
  },
})
