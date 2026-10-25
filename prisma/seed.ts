import { hash } from 'bcryptjs'
import { prisma } from '../src/infra/database/prisma'
import { env } from '../src/config/env'
import { CHURCH_SEED } from '../src/modules/churches/seed/church-seed-data'

export async function seed() {
  // ---------------------------------------------------------------------------
  // Admin user
  // ---------------------------------------------------------------------------
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      publicId: '0197f9cb-e9dd-72f2-8bea-863124fbec4c',
      name: 'Admin User',
      username: 'Admin',
      email: 'admin@example.com',
      cpf: '111.111.111-11',
      passwordHash: await hash(env.SEED_ADMIN_PASSWORD, env.HASH_SALT_ROUNDS),
      role: 'ADMIN',
    },
  })

  // ---------------------------------------------------------------------------
  // Churches
  // ---------------------------------------------------------------------------
  const churches = CHURCH_SEED

  // Delete existing churches to avoid duplicates
  await prisma.$executeRaw`DELETE FROM churches`

  for (const church of churches) {
    await prisma.$executeRaw`
      INSERT INTO churches (public_id, name, address, lat, lon, geog, created_at, updated_at)
      VALUES (
        ${church.publicId},
        ${church.name},
        ${church.address},
        ${church.lat},
        ${church.lon},
        ST_SetSRID(ST_MakePoint(${church.lon}, ${church.lat}), 4326)::geography,
        NOW(),
        NOW()
      )
    `
  }

  console.log(`✅ Seeded ${churches.length} churches`)
}

seed()
  .then(() => {
    console.log('Seeding completed successfully.')
    prisma.$disconnect()
    process.exit(0)
  })
  .catch((error) => {
    console.error('Error during seeding:', error)
    prisma.$disconnect()
    process.exit(1)
  })
