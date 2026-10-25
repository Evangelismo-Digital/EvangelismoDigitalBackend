/**
 * The churches the seed writes on every deploy (`npm run db:deploy` replaces the
 * table). Kept apart from `prisma/seed.ts`, which runs on import, so the data
 * itself can be checked by a test.
 *
 * Every address follows one format, `Rua, nº - Bairro, Cidade - UF`, and names
 * use title case: the list is shown to people as-is.
 */
export interface ChurchSeed {
  publicId: string
  name: string
  address: string
  lat: number
  lon: number
}

export const CHURCH_SEED: readonly ChurchSeed[] = [
  {
    publicId: '0197fa3e-1b7d-7b8c-9e4a-1d2f3c6b8a57',
    name: 'Igreja Presbiteriana Água Viva',
    address: 'R. Sete Cruzes, 17 - Rio do Ouro, Niterói - RJ',
    lat: -22.879425115962,
    lon: -42.98820687963332,
  },
  {
    publicId: '019c0baf-a7de-77c7-a86a-6c5c7330c01b',
    name: 'Igreja Batista da Orla de Niterói',
    address: 'R. Prof. Lara Vilela, 140 - São Domingos, Niterói - RJ',
    lat: -22.901485779245583,
    lon: -43.12753088358463,
  },
  {
    publicId: '019c0bb1-3e0c-7878-8676-f0cb66158ae1',
    name: 'Primeira Igreja Batista em Vila da Penha | PIBVP',
    address: 'Av. Meriti, 2470 - Vila da Penha, Rio de Janeiro - RJ',
    lat: -22.838490560009944,
    lon: -43.310333725733315,
  },
  {
    publicId: '019c0bb8-05ad-7ad7-971b-0f892bd20bb2',
    name: 'Primeira Igreja Batista Tanguá',
    address: 'R. Manoel João Gonçalves, 1140 - Centro, Tanguá - RJ',
    lat: -22.729780340329153,
    lon: -42.71025199422345,
  },
  {
    publicId: '0197fa3e-1b83-7d4c-9a8f-1e2b3c5d6a90',
    name: 'Igreja Presbiteriana Betânia de Icaraí',
    address: 'R. Otávio Carneiro, 144 - Icaraí, Niterói - RJ',
    lat: -22.905555367949116,
    lon: -43.10865350352405,
  },

  // ---------------------------------------------------------------------------
  // Rio de Janeiro - Capital
  // ---------------------------------------------------------------------------
  {
    publicId: '0197fa4a-02c1-7b21-8f3d-1a2b3c4d5e01',
    name: 'Igreja Presbiteriana do Rio de Janeiro (Catedral)',
    address: 'R. Silva Jardim, 23 - Centro, Rio de Janeiro - RJ',
    lat: -22.90796180249929,
    lon: -43.181362869287575,
  },
  {
    publicId: '71b1d3a3-e39a-4b9b-a737-a5af7da4ac3a',
    name: 'Igreja Batista Carisma',
    address: 'R. Atílio Vivacqua, 101 - Jardim América, Rio de Janeiro - RJ',
    lat: -22.80580711046469,
    lon: -43.32448393558175,
  },
  {
    publicId: '0197fa4a-02c2-7c9a-9e1d-2b3a4c5d6e02',
    name: 'Igreja Presbiteriana Libertas',
    address: 'R. Francisco Sá, 51 - Copacabana, Rio de Janeiro - RJ',
    lat: -22.983507665249572,
    lon: -43.19223349569387,
  },
  {
    publicId: '0197fa4a-02c3-7d5e-8a9c-3b4d5e6f7a03',
    name: 'Igreja Presbiteriana de Vila Isabel',
    address: 'R. Justiniano da Rocha, 351 - Vila Isabel, Rio de Janeiro - RJ',
    lat: -22.912239588386573,
    lon: -43.24163236242759,
  },
  {
    publicId: '0197fa4a-02c4-7a8f-9c2d-4e5b6a7d8f04',
    name: 'Igreja Presbiteriana Carioca',
    address: 'R. José Bonifácio, 552 - Todos os Santos, Rio de Janeiro - RJ',
    lat: -22.892438242339615,
    lon: -43.282480855372874,
  },
  {
    publicId: '0197fa4a-02c5-7c31-8d9a-5e6f7a8b9c05',
    name: 'Igreja Presbiteriana de Jacarezinho',
    address: 'R. José Maria Belo, 224 - Jacaré, Rio de Janeiro - RJ',
    lat: -22.889659066257444,
    lon: -43.26024872619198,
  },
  {
    publicId: '0197fa4a-02c6-7e42-9a1c-6f7b8d9e0a06',
    name: 'Igreja Presbiteriana de Campo Grande',
    address: 'R. Itápolis, 68 - Campo Grande, Rio de Janeiro - RJ',
    lat: -22.914711688853767,
    lon: -43.540545446038,
  },
  {
    publicId: '0197fa4a-02c7-7b9d-8e1a-7c8d9e0f1a07',
    name: 'Igreja Presbiteriana de Realengo',
    address: 'R. Vila Nova, 415 - Realengo, Rio de Janeiro - RJ',
    lat: -22.890279031449474,
    lon: -43.43897580450623,
  },
  {
    publicId: '0197fa4a-02c8-7d6a-9f2e-8a9b0c1d2e08',
    name: 'Igreja Presbiteriana Independente do Rio de Janeiro',
    address: 'R. Ibituruna, 126 - Maracanã, Rio de Janeiro - RJ',
    lat: -22.91167007091762,
    lon: -43.22208791977698,
  },
]
