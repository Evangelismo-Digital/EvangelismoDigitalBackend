import { prisma } from '../src/lib/prisma'

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
      // password: 'ybp_whf3wxn2xdr6MTE'
      passwordHash: '$2a$12$y7AWvv8D1P9AVn2G8XkNZOXyrMZ658QFJyR.2kxM.oP/wmgB/.7.2',
      role: 'ADMIN',
    },
  })

  // ---------------------------------------------------------------------------
  // Churches
  // ---------------------------------------------------------------------------
  const churches = [
    {
      publicId: '0197fa3e-1b7d-7b8c-9e4a-1d2f3c6b8a57',
      name: 'Igreja Presbiteriana Água Viva',
      address: 'R. Sete Cruzes, 17 - Rio do Ouro - Niterói/RJ',
      lat: -22.879425115962,
      lon: -42.98820687963332,
    },
    {
      publicId: '019c0baf-a7de-77c7-a86a-6c5c7330c01b',
      name: 'Igreja Batista da Orla de Niterói',
      address: '001, R. Prof. Lara Vilela, 140 - São Domingos, Niterói - RJ',
      lat: -22.901485779245583,
      lon: -43.12753088358463,
    },
    {
      publicId: '019c0bb1-3e0c-7878-8676-f0cb66158ae1',
      name: 'Primeira Igreja Batista em Vila da Penha | PIBVP',
      address: 'Av. Meriti, 2470 - Vila da Penha, Rio de Janeiro - RJ, 21211-006',
      lat: -22.838490560009944,
      lon: -43.310333725733315,
    },
    {
      publicId: '019c0bb8-05ad-7ad7-971b-0f892bd20bb2',
      name: 'PRIMEIRA IGREJA BATISTA TANGUA',
      address: 'R. Manoel João Gonçalves, 1140 - Centro, Tanguá - RJ, 24890-000',
      lat: -22.729780340329153,
      lon: -42.71025199422345,
    },
    {
      publicId: '0197fa3e-1b83-7d4c-9a8f-1e2b3c5d6a90',
      name: 'Igreja Presbiteriana Betânia de Icaraí',
      address: 'R. Otávio Carneiro, 144 - Icaraí - Niterói/RJ',
      lat: -22.905555367949116,
      lon: -43.10865350352405,
    },

    // ---------------------------------------------------------------------------
    // Rio de Janeiro - Capital
    // ---------------------------------------------------------------------------
    {
      publicId: '0197fa4a-02c1-7b21-8f3d-1a2b3c4d5e01',
      name: 'Igreja Presbiteriana do Rio de Janeiro (Catedral)',
      address: 'R. Silva Jardim, 23 - Centro, Rio de Janeiro/RJ',
      lat: -22.90796180249929,
      lon: -43.181362869287575,
    },
    {
      publicId: "71b1d3a3-e39a-4b9b-a737-a5af7da4ac3a",
      name: "igreja batista carisma",
      address: "r. atílio vivacqua, 101 - jardim américa, rio de janeiro - rj",
      lat: -22.80580711046469,
      lon: -43.32448393558175,
    },
    {
      publicId: '0197fa4a-02c2-7c9a-9e1d-2b3a4c5d6e02',
      name: 'Igreja Presbiteriana Libertas',
      address: 'R. Francisco Sá, 51 - Copacabana, Rio de Janeiro/RJ',
      lat: -22.983507665249572,
      lon: -43.19223349569387,
    },
    {
      publicId: '0197fa4a-02c3-7d5e-8a9c-3b4d5e6f7a03',
      name: 'Igreja Presbiteriana de Vila Isabel',
      address: 'R. Justiniano da Rocha, 351 - Vila Isabel, Rio de Janeiro/RJ',
      lat: -22.912239588386573,
      lon: -43.24163236242759,
    },
    {
      publicId: '0197fa4a-02c4-7a8f-9c2d-4e5b6a7d8f04',
      name: 'Igreja Presbiteriana Carioca',
      address: 'R. José Bonifácio, 552 - Todos os Santos, Rio de Janeiro/RJ',
      lat: -22.892438242339615,
      lon: -43.282480855372874,
    },
    {
      publicId: '0197fa4a-02c5-7c31-8d9a-5e6f7a8b9c05',
      name: 'Igreja Presbiteriana de Jacarezinho',
      address: 'R. José Maria Belo, 224 - Jacaré, Rio de Janeiro/RJ',
      lat: -22.889659066257444,
      lon: -43.26024872619198,
    },
    {
      publicId: '0197fa4a-02c6-7e42-9a1c-6f7b8d9e0a06',
      name: 'Igreja Presbiteriana de Campo Grande',
      address: 'R. Itápolis, 68 - Campo Grande, Rio de Janeiro/RJ',
      lat: -22.914711688853767,
      lon: -43.540545446038,
    },
    {
      publicId: '0197fa4a-02c7-7b9d-8e1a-7c8d9e0f1a07',
      name: 'Igreja Presbiteriana de Realengo',
      address: 'R. Vila Nova, 415 - Realengo, Rio de Janeiro/RJ',
      lat: -22.890279031449474,
      lon: -43.43897580450623,
    },
    {
      publicId: '0197fa4a-02c8-7d6a-9f2e-8a9b0c1d2e08',
      name: 'Igreja Presbiteriana Independente do Rio de Janeiro',
      address: 'R. Ibituruna, 126 - Maracanã, Rio de Janeiro/RJ',
      lat: -22.91167007091762,
      lon: -43.22208791977698,
    },
  ]

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
