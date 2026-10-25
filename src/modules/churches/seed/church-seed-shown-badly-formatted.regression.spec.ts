import { describe, expect, it } from 'vitest'
import { CHURCH_SEED } from './church-seed-data'

/**
 * Regression: **church names and addresses were shown badly formatted.**
 *
 * The seeded list reached people as-is: "igreja batista carisma" / "r. atílio
 * vivacqua…" were all lowercase, "PRIMEIRA IGREJA BATISTA TANGUA" all caps,
 * "001, R. Prof. Lara Vilela, 140…" carried a stray prefix, and addresses mixed
 * "Niterói/RJ", "Niterói - RJ" and trailing CEPs. The seed replaces the table on
 * every deploy, so this is what production showed. Found by the frontend's
 * real-backend suite. Defect: bad church seed data (2026-10-25).
 */

/** `Rua, nº - Bairro, Cidade - UF` */
const ADDRESS_FORMAT = /^[^,]+, \d+ - [^,]+, [^,-]+ - [A-Z]{2}$/

function isShouting(text: string): boolean {
  return text === text.toUpperCase()
}

function isWhispering(text: string): boolean {
  return text === text.toLowerCase()
}

describe('Regression: church names and addresses were shown badly formatted', () => {
  it.each(CHURCH_SEED.map((church) => [church.name, church.address]))(
    '%s has a cased name and a `Rua, nº - Bairro, Cidade - UF` address',
    (name, address) => {
      expect(isShouting(name) || isWhispering(name)).toBe(false)
      expect(address).toMatch(ADDRESS_FORMAT)
    },
  )

  it('rejects every defect it was written for', () => {
    // Counterweight: a format check that accepts the broken originals proves
    // nothing about the data above.
    for (const broken of [
      'r. atílio vivacqua, 101 - jardim américa, rio de janeiro - rj',
      '001, R. Prof. Lara Vilela, 140 - São Domingos, Niterói - RJ',
      'R. Sete Cruzes, 17 - Rio do Ouro - Niterói/RJ',
      'Av. Meriti, 2470 - Vila da Penha, Rio de Janeiro - RJ, 21211-006',
    ]) {
      expect(broken).not.toMatch(ADDRESS_FORMAT)
    }
    expect(isWhispering('igreja batista carisma')).toBe(true)
    expect(isShouting('PRIMEIRA IGREJA BATISTA TANGUA')).toBe(true)
  })

  it('keeps every church identifiable and placed in Brazil', () => {
    expect(CHURCH_SEED.length).toBeGreaterThan(0)
    for (const { publicId } of CHURCH_SEED) {
      expect(publicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    }
    expect(new Set(CHURCH_SEED.map((church) => church.publicId)).size).toBe(CHURCH_SEED.length)
    for (const { lat, lon } of CHURCH_SEED) {
      expect(lat).toBeGreaterThan(-34)
      expect(lat).toBeLessThan(6)
      expect(lon).toBeGreaterThan(-74)
      expect(lon).toBeLessThan(-34)
    }
  })
})
