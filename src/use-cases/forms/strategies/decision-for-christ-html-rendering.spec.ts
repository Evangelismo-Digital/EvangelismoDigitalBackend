/**
 * Renderização real do HTML dos e-mails de "decisão por Cristo", pelo caminho
 * de produção (estratégia → React.createElement → `render`).
 *
 * Mesma preocupação do spec de contato: o conteúdo vem de um formulário
 * público e chega a um e-mail que alguém da equipe abre. Aqui há um campo a
 * mais sob controle do usuário (`location`) e um opcional (`ipAddress`), e os
 * dois precisam do mesmo tratamento.
 */
import { describe, it, expect } from 'vitest'
import { DecisionForChristEmailStrategy } from './decision-for-christ-email-strategy'
import { FormPayload } from 'core/types/use-cases/forms/form-payload'
import { isOk } from 'core/shared/result'

const strategy = new DecisionForChristEmailStrategy()

function form(overrides: Record<string, unknown> = {}): FormPayload {
  return {
    type: 'decision-for-Christ',
    name: 'Pedro',
    lastName: 'Alves',
    email: 'pedro@example.com',
    location: 'Niterói',
    ...overrides,
  } as FormPayload
}

async function userHtml(payload: FormPayload): Promise<string> {
  const result = await strategy.buildUserEmail(payload)
  if (!isOk(result)) throw new Error('buildUserEmail falhou')
  return result.value.html
}

async function staffHtml(payload: FormPayload): Promise<string> {
  const result = await strategy.buildStaffEmail(payload)
  if (!isOk(result)) throw new Error('buildStaffEmail falhou')
  return result.value.html
}

function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('HTML dos e-mails de decisão por Cristo', () => {
  it('produz um documento HTML completo para o usuário', async () => {
    const html = await userHtml(form())

    expect(html).toContain('<html')
    expect(html).toContain('</html>')
    expect(html).toContain('Pedro')
  })

  it('inclui identidade e localidade no aviso da equipe', async () => {
    const html = await staffHtml(form())

    expect(html).toContain('Pedro')
    expect(html).toContain('Alves')
    expect(html).toContain('pedro@example.com')
    expect(html).toContain('Niterói')
  })

  it('não vaza undefined nem [object Object] quando o IP está ausente', async () => {
    const html = await staffHtml(form({ ipAddress: undefined }))

    expect(html).not.toContain('undefined')
    expect(html).not.toContain('[object Object]')
  })

  describe('escape de conteúdo enviado pelo usuário', () => {
    it('escapa HTML no nome do e-mail ao usuário', async () => {
      const html = await userHtml(form({ name: '<script>alert(1)</script>' }))

      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('escapa HTML no nome dentro do aviso da equipe', async () => {
      const html = await staffHtml(form({ name: '<script>alert(1)</script>' }))

      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&lt;script&gt;')
    })

    /**
     * `location` é texto livre do formulário e vai direto para o corpo do
     * aviso da equipe — o mesmo risco do nome, num campo que passa despercebido.
     */
    it('escapa HTML na localidade', async () => {
      const html = await staffHtml(form({ location: '<img src=x onerror=alert(1)>' }))

      expect(html).not.toContain('<img src=x onerror=alert(1)>')
      expect(html).toContain('&lt;img')
    })
  })

  /** CONTRAPESO: localidade e nome brasileiros continuam legíveis. */
  describe('contrapeso: conteúdo legítimo preservado', () => {
    it('preserva acentos na localidade', async () => {
      const html = await staffHtml(form({ location: 'São Gonçalo' }))

      expect(html).toContain('São Gonçalo')
    })

    it('preserva um nome com apóstrofo, codificado mas legível', async () => {
      const html = await staffHtml(form({ name: "D'Ávila" }))

      expect(decodeEntities(html)).toContain("D'Ávila")
    })
  })
})
