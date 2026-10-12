/**
 * Renderização real do HTML do e-mail de recuperação de senha, pelo caminho de
 * produção (estratégia → React.createElement → `render`).
 *
 * É o e-mail de maior risco do sistema: carrega um token VÁLIDO numa URL. Dois
 * modos de falha importam aqui e nenhum apareceria numa inspeção visual —
 * o link sair quebrado (o usuário não consegue trocar a senha) e o nome, que
 * vem do cadastro, escapar para dentro do HTML.
 */
import { describe, it, expect } from 'vitest'
import { PasswordResetDispatchStrategy } from './password-reset-dispatch-strategy'
import { IOutboxEvent } from 'core/contracts/repository/outbox-repository.interface'
import { isOk } from 'core/shared/result'
import { env } from '@env/index'
import { PASSWORD_RESET_CONSTANTS } from 'messages/constants/auth/password-reset'

const strategy = new PasswordResetDispatchStrategy()
const TOKEN = 'a'.repeat(64)

function event(payload: Record<string, unknown> = {}): IOutboxEvent {
  return {
    publicId: 'evt-1',
    type: 'PasswordResetRequested',
    payload: { name: 'Carla', email: 'carla@example.com', token: TOKEN, ...payload },
  } as unknown as IOutboxEvent
}

async function html(evt: IOutboxEvent): Promise<string> {
  const result = await strategy.buildDispatch(evt)
  if (!isOk(result)) throw new Error('buildDispatch falhou')
  return result.value.emails[0].html
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
}

describe('HTML do e-mail de recuperação de senha', () => {
  it('produz um documento HTML completo', async () => {
    const output = await html(event())

    expect(output).toContain('<html')
    expect(output).toContain('</html>')
  })

  /**
   * O link é a função inteira do e-mail. Um href escapado a mais, cortado ou
   * montado errado transforma a recuperação de senha em suporte manual.
   */
  it('monta o link de redefinição com a URL do frontend e o token, intacto no href', async () => {
    const output = await html(event())
    const expectedUrl = `${env.FRONTEND_URL}/reset-password/${TOKEN}`

    expect(decodeEntities(output)).toContain(`href="${expectedUrl}"`)
    expect(output).toContain(TOKEN)
  })

  it('informa a janela de validade que o sistema realmente aplica', async () => {
    const output = await html(event())

    expect(output).toContain(String(PASSWORD_RESET_CONSTANTS.TOKEN_EXPIRES_IN_MINUTES))
  })

  it('identifica a aplicação pelo nome configurado', async () => {
    const output = await html(event())

    expect(output).toContain(env.APP_NAME)
  })

  it('cumprimenta a pessoa pelo nome, sem vazar undefined', async () => {
    const output = await html(event({ name: 'Carla' }))

    expect(output).toContain('Carla')
    expect(output).not.toContain('undefined')
    expect(output).not.toContain('[object Object]')
  })

  describe('escape', () => {
    it('escapa HTML no nome do usuário', async () => {
      const output = await html(event({ name: '<script>alert(1)</script>' }))

      expect(output).not.toContain('<script>alert(1)</script>')
      expect(output).toContain('&lt;script&gt;')
    })

    /**
     * O token entra num atributo href. Um valor hostil aqui não poderia fechar
     * o atributo e abrir uma tag — este teste fixa que não fecha.
     */
    it('não permite que um token hostil quebre o atributo href', async () => {
      const output = await html(event({ token: '"><img src=x onerror=alert(1)>' }))

      expect(output).not.toContain('<img src=x onerror=alert(1)>')
      expect(output).not.toContain('onerror=alert(1)>')
    })
  })

  /** CONTRAPESO: nome brasileiro legítimo continua legível. */
  it('contrapeso: preserva acentos no nome', async () => {
    const output = await html(event({ name: 'Conceição' }))

    expect(output).toContain('Conceição')
  })
})
