/**
 * Renderização real do HTML dos e-mails de contato — pelo caminho de produção
 * (estratégia → React.createElement → `render` do React Email), sem mock do
 * renderizador. É o que torna estes testes uma prova e não uma encenação.
 *
 * O ponto central é o ESCAPE. Os templates antigos eram template literals
 * interpolando `${name}` direto no HTML, com `name` vindo do formulário
 * público; o React escapa por construção, e é essa garantia que precisa de
 * teste — inclusive o contrapeso, porque escapar DEMAIS estraga nome
 * brasileiro legítimo, o que é um defeito real num produto em PT-BR.
 */
import { describe, it, expect } from 'vitest'
import { ContactEmailStrategy } from './contact-email.strategy'
import { FormPayload } from '@modules/forms/dto/form-payload.type'
import { isOk } from '@common/utils/result'

const strategy = new ContactEmailStrategy()

function form(overrides: Partial<FormPayload> = {}): FormPayload {
  return {
    type: 'contact',
    name: 'Maria',
    lastName: 'Silva',
    email: 'maria@example.com',
    message: 'Olá, gostaria de saber mais.',
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

/**
 * Decodifica as entidades que o React emite. A asserção útil é sobre o texto
 * que o destinatário LÊ: `D&#x27;Ávila` está correto no fonte e aparece como
 * `D'Ávila` no cliente de e-mail, então exigir o apóstrofo cru no HTML testaria
 * a codificação, não a legibilidade.
 */
function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('HTML dos e-mails de contato', () => {
  describe('documento renderizado', () => {
    it('produz um documento HTML completo para o usuário', async () => {
      const html = await userHtml(form())

      expect(html).toContain('<html')
      expect(html).toContain('</html>')
      expect(html).toMatch(/<body/i)
    })

    it('interpola o nome do destinatário', async () => {
      const html = await userHtml(form({ name: 'Joana' } as Partial<FormPayload>))

      expect(html).toContain('Joana')
    })

    /**
     * Um `undefined` ou `[object Object]` no corpo é o sintoma clássico de prop
     * trocada — passa despercebido porque o e-mail "sai", só sai errado.
     */
    it('não vaza undefined, null nem [object Object] no corpo', async () => {
      const html = await userHtml(form())

      expect(html).not.toContain('undefined')
      expect(html).not.toContain('[object Object]')
      expect(html).not.toContain('>null<')
    })

    it('inclui nome, sobrenome e e-mail no aviso da equipe', async () => {
      const html = await staffHtml(form({ name: 'Ana', lastName: 'Souza', email: 'ana@example.com' } as never))

      expect(html).toContain('Ana')
      expect(html).toContain('Souza')
      expect(html).toContain('ana@example.com')
    })
  })

  describe('escape de conteúdo enviado pelo usuário', () => {
    it('escapa HTML no nome, no e-mail do usuário', async () => {
      const html = await userHtml(form({ name: '<script>alert(1)</script>' } as never))

      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&lt;script&gt;')
    })

    /**
     * O staff é o alvo mais valioso: é alguém da equipe abrindo, num cliente de
     * e-mail, um texto que veio de um formulário público.
     */
    it('escapa HTML no nome dentro do aviso da equipe', async () => {
      const html = await staffHtml(form({ name: '<script>alert(1)</script>' } as never))

      expect(html).not.toContain('<script>alert(1)</script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('escapa uma tentativa de injetar atributo/tag no sobrenome', async () => {
      const html = await staffHtml(form({ lastName: '"><img src=x onerror=alert(1)>' } as never))

      expect(html).not.toContain('<img src=x onerror=alert(1)>')
      expect(html).not.toContain('onerror=alert(1)>')
    })

    it('escapa HTML no endereço de e-mail exibido para a equipe', async () => {
      const html = await staffHtml(form({ email: '<b>fake</b>@example.com' } as never))

      expect(html).not.toContain('<b>fake</b>@example.com')
      expect(html).toContain('&lt;b&gt;')
    })
  })

  /**
   * CONTRAPESO do bloco acima. "Escapa tudo" é satisfeito por um renderizador
   * que destrua o conteúdo; estes testes fixam que nome brasileiro legítimo
   * continua legível — acento, cedilha e apóstrofo não podem virar entidade
   * visível nem sumir.
   */
  describe('contrapeso: nomes legítimos não são mutilados', () => {
    it.each([
      ['acentos e cedilha', 'João Conceição'],
      ['apóstrofo', "Maria D'Ávila"],
      ['trema e circunflexo', 'Müller Ângelo'],
      ['hífen', 'Ana-Luísa'],
    ])('preserva %s', async (_label, name) => {
      const html = await userHtml(form({ name } as never))

      expect(decodeEntities(html)).toContain(name)
    })

    it('preserva um apóstrofo no aviso da equipe, codificado mas legível', async () => {
      const html = await staffHtml(form({ name: "D'Ávila" } as never))

      // Codificado no fonte é correto; o que não pode é sumir ou vir mutilado.
      expect(decodeEntities(html)).toContain("D'Ávila")
      expect(html).not.toContain('D&amp;#x27;Ávila')
    })

    /**
     * Acentos NÃO são codificados pelo React: aparecem crus no fonte, e é assim
     * que devem ficar. Se um dia virarem entidade, o e-mail continua legível,
     * mas o diff diria que algo mudou na renderização sem ninguém ter pedido.
     */
    it('mantém acentos como caracteres crus no fonte, sem virar entidade', async () => {
      const html = await userHtml(form({ name: 'João Conceição' } as never))

      expect(html).toContain('João Conceição')
    })
  })
})
