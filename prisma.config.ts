import { defineConfig } from 'prisma/config'
import 'dotenv/config'

// Fallback só para comandos da CLI que não conectam (generate/validate) em
// ambientes sem env (job static do CI). O TLD .invalid nunca resolve (RFC 6761):
// qualquer comando que tente conectar falha imediatamente com erro claro, em vez
// de atingir silenciosamente um banco real em localhost.
const fallbackDatabaseUrl = 'postgresql://placeholder:placeholder@prisma-cli-placeholder.invalid:5432/placeholder'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL_LOCAL ?? process.env.DATABASE_URL ?? fallbackDatabaseUrl,
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
})
