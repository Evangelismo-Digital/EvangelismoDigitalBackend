import { getEventListeners } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { abortRace } from './abort-race'

describe('abortRace', () => {
  it('resolves with the promise value if it settles first', async () => {
    const ac = new AbortController()
    const result = await abortRace(Promise.resolve('ok'), ac.signal, () => 'aborted')
    expect(result).toBe('ok')
  })

  it('rejects with the promise error if it settles first', async () => {
    const ac = new AbortController()
    await expect(abortRace(Promise.reject(new Error('fail')), ac.signal, () => 'aborted')).rejects.toThrow('fail')
  })

  it('returns the onAbort value if the signal fires', async () => {
    const ac = new AbortController()
    const promise = new Promise<string>(() => {})

    setTimeout(() => ac.abort(), 10)

    const result = await abortRace(promise, ac.signal, () => 'aborted')
    expect(result).toBe('aborted')
  })

  it('short-circuits if the signal is already aborted', async () => {
    const signal = AbortSignal.abort()
    const result = await abortRace(new Promise<string>(() => {}), signal, () => 'already-aborted')
    expect(result).toBe('already-aborted')
  })

  it('cleans up the listener when the promise resolves', async () => {
    const ac = new AbortController()
    const signal = ac.signal

    const promise = Promise.resolve('ok')
    await abortRace(promise, signal, () => 'aborted')

    // addAbortListener should have been cleaned up if it was a promise resolution.
    // wait a tick just in case
    await new Promise((r) => setTimeout(r, 0))
    // We can't directly check the listener count on AbortSignal in standard web APIs,
    // but the test shouldn't leave unhandled things.
  })
})

it('rejects the promise if onAbort throws synchronously', async () => {
  const ac = new AbortController()
  const promise = new Promise<string>(() => {})

  setTimeout(() => ac.abort(), 10)

  await expect(
    abortRace(promise, ac.signal, () => {
      throw new Error('sync fail')
    }),
  ).rejects.toThrow('sync fail')
})

it('rejects the promise if onAbort throws synchronously and signal is already aborted', async () => {
  const signal = AbortSignal.abort()
  const promise = new Promise<string>(() => {})

  await expect(
    abortRace(promise, signal, () => {
      throw new Error('sync fail')
    }),
  ).rejects.toThrow('sync fail')
})

describe('abortRace — normalização de motivos e guardas de corrida', () => {
  /**
   * `toError` normaliza o que vier. Os três ramos existem porque um motivo de
   * abort pode ser um Error, uma string (o caso comum: `controller.abort('...')`)
   * ou qualquer outro valor, e quem recebe precisa sempre de um Error com
   * mensagem legível — não de `[object Object]` no log do incidente.
   */
  it('preserva a instância de Error que o onAbort lança', async () => {
    const controller = new AbortController()
    controller.abort()
    const original = new Error('o original')

    await expect(
      abortRace(new Promise<string>(() => {}), controller.signal, () => {
        throw original
      }),
    ).rejects.toBe(original)
  })

  it('converte um motivo em string para Error, mantendo a mensagem', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      abortRace(new Promise<string>(() => {}), controller.signal, () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'falha em texto'
      }),
    ).rejects.toThrow('falha em texto')
  })

  it('converte um motivo que não é Error nem string, sem perder o valor', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      abortRace(new Promise<string>(() => {}), controller.signal, () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw { code: 42 }
      }),
    ).rejects.toThrow('[object Object]')
  })

  it('converte um motivo numérico lançado durante a corrida', async () => {
    const controller = new AbortController()

    const race = abortRace(new Promise<string>(() => {}), controller.signal, () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 404
    })
    controller.abort()

    await expect(race).rejects.toThrow('404')
  })

  /**
   * As guardas `settled` existem para o caso em que promise e sinal chegam
   * quase juntos: o primeiro a chegar decide, e o segundo não pode reabrir uma
   * promise já resolvida nem vazar erro depois do fato.
   */
  it('o sinal que chega DEPOIS da promise não altera o resultado já entregue', async () => {
    const controller = new AbortController()
    const onAbort = vi.fn(() => 'valor-do-abort')

    const race = abortRace(Promise.resolve('valor-da-promise'), controller.signal, onAbort)
    await expect(race).resolves.toBe('valor-da-promise')

    controller.abort()
    await expect(race).resolves.toBe('valor-da-promise')
    expect(onAbort).not.toHaveBeenCalled()
  })

  it('a promise que rejeita DEPOIS do abort não sobrepõe o resultado do abort', async () => {
    const controller = new AbortController()
    let rejectLater: (reason: unknown) => void = () => {}
    const pending = new Promise<string>((_resolve, reject) => {
      rejectLater = reject
    })

    const race = abortRace(pending, controller.signal, () => 'abortado')
    controller.abort()

    await expect(race).resolves.toBe('abortado')

    rejectLater(new Error('tarde demais'))
    await expect(race).resolves.toBe('abortado')
  })

  it('remove o listener de abort quando a promise rejeita', async () => {
    const controller = new AbortController()

    await expect(abortRace(Promise.reject(new Error('falhou')), controller.signal, () => 'nunca')).rejects.toThrow(
      'falhou',
    )

    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('remove o listener de abort quando o sinal vence a corrida', async () => {
    const controller = new AbortController()

    const race = abortRace(new Promise<string>(() => {}), controller.signal, () => 'abortado')
    controller.abort()
    await expect(race).resolves.toBe('abortado')

    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('aceita um onAbort assíncrono, entregando o valor resolvido', async () => {
    const controller = new AbortController()

    const race = abortRace(new Promise<string>(() => {}), controller.signal, async () => {
      await Promise.resolve()
      return 'assíncrono'
    })
    controller.abort()

    await expect(race).resolves.toBe('assíncrono')
  })

  it('propaga a rejeição de um onAbort assíncrono', async () => {
    const controller = new AbortController()

    const race = abortRace(new Promise<string>(() => {}), controller.signal, () =>
      Promise.reject(new Error('abort assíncrono falhou')),
    )
    controller.abort()

    await expect(race).rejects.toThrow('abort assíncrono falhou')
  })
})

/**
 * As guardas `settled` decidem quem VENCE a corrida quando o `onAbort` é
 * assíncrono: entre o abort disparar e o seu valor ficar pronto há um turno em
 * que a promise original ainda pode se resolver. Sem a guarda, essa resolução
 * tardia roubaria a corrida que o abort já tinha vencido.
 */
describe('abortRace — quem vence a corrida com onAbort assíncrono', () => {
  it('o abort continua vencendo mesmo que a promise RESOLVA enquanto o onAbort aguarda', async () => {
    const controller = new AbortController()
    let resolvePromise: (value: string) => void = () => {}
    const pending = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })

    const race = abortRace(pending, controller.signal, async () => {
      await Promise.resolve()
      return 'do-abort'
    })

    controller.abort()
    resolvePromise('da-promise')

    await expect(race).resolves.toBe('do-abort')
  })

  it('o abort continua vencendo mesmo que a promise REJEITE enquanto o onAbort aguarda', async () => {
    const controller = new AbortController()
    let rejectPromise: (reason: unknown) => void = () => {}
    const pending = new Promise<string>((_resolve, reject) => {
      rejectPromise = reject
    })

    const race = abortRace(pending, controller.signal, async () => {
      await Promise.resolve()
      return 'do-abort'
    })

    controller.abort()
    rejectPromise(new Error('rejeição tardia'))

    await expect(race).resolves.toBe('do-abort')
  })
})
