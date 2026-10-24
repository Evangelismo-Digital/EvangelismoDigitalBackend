/**
 * Regressão — "rejeição não tratada quando o sinal já estava abortado".
 *
 * O QUE QUEBRAVA: `abortRace` tem um atalho para o caso em que o sinal JÁ está
 * abortado na chamada — devolve o resultado de `onAbort` sem montar a corrida.
 * Esse caminho nunca anexava handler algum à promise recebida. Ela continua em
 * voo, e quando rejeitava não havia ninguém escutando: `unhandledRejection`.
 *
 * POR QUE IMPORTAVA: não era ruído de teste. O caminho real é
 * `runWithRetries`, que chama `policy.execute(...)` e só então corre contra o
 * deadline; se a ação aborta o sinal do cliente durante a primeira tentativa
 * (cliente desconectou), `settleFirst` já encontra o sinal abortado e abandona
 * a sequência do cockatiel — que rejeita logo depois com o erro de deadline.
 * Em produção o `close-with-grace` do worker escuta `unhandledRejection` e
 * trata como fatal, então um cliente desconectando na hora errada derrubava o
 * processo. O docblock de `settleFirst` já afirmava que "a sequência abandonada
 * mantém sua rejeição tratada" — verdade no caminho do listener, falso neste.
 *
 * DEFEITO: detectado pelo gate de pre-commit durante a Fase 3 do plano de
 * reúso de dependências; reproduzido sem alterações em `db66e63`.
 *
 * A CORREÇÃO: o atalho passa a consumir a promise abandonada
 * (`promise.catch(...)`), a mesma garantia que o caminho do listener já dava.
 */
import { describe, it, expect } from 'vitest'
import { abortRace } from './abort-race'

/** Captura rejeições não tratadas reportadas pelo processo durante o bloco. */
async function collectUnhandledRejections(run: () => Promise<void>): Promise<unknown[]> {
  const captured: unknown[] = []
  const onUnhandled = (reason: unknown) => captured.push(reason)

  process.on('unhandledRejection', onUnhandled)

  try {
    await run()
    // O Node só emite `unhandledRejection` depois de drenar as microtasks;
    // dois turnos de macrotask dão folga suficiente para o evento chegar.
    await new Promise((resolve) => setTimeout(resolve, 10))
    await new Promise((resolve) => setTimeout(resolve, 10))
  } finally {
    process.off('unhandledRejection', onUnhandled)
  }

  return captured
}

describe('regressão: promise abandonada com sinal já abortado', () => {
  /**
   * O SINTOMA. Antes da correção, a rejeição da promise abandonada chegava ao
   * processo como `unhandledRejection`.
   */
  it('não deixa rejeição não tratada quando o sinal já estava abortado na chamada', async () => {
    const controller = new AbortController()
    controller.abort('cliente desconectou')

    const unhandled = await collectUnhandledRejections(async () => {
      // Rejeita DEPOIS da chamada, que é o que torna o vazamento observável.
      const abandoned = new Promise<string>((_resolve, reject) => {
        setTimeout(() => reject(new Error('sequência abandonada falhou')), 1)
      })

      await expect(
        abortRace(abandoned, controller.signal, () => {
          throw new Error('abortado')
        }),
      ).rejects.toThrow('abortado')
    })

    expect(unhandled).toEqual([])
  })

  it('também não vaza quando o onAbort do atalho RESOLVE em vez de lançar', async () => {
    const controller = new AbortController()
    controller.abort()

    const unhandled = await collectUnhandledRejections(async () => {
      const abandoned = new Promise<string>((_resolve, reject) => {
        setTimeout(() => reject(new Error('abandonada')), 1)
      })

      await expect(abortRace(abandoned, controller.signal, () => 'valor-do-abort')).resolves.toBe('valor-do-abort')
    })

    expect(unhandled).toEqual([])
  })

  /**
   * CONTRAPESO. "Não vaza rejeição" é satisfeito trivialmente por uma
   * implementação que engolisse TUDO. Estes fixam que o resultado continua
   * sendo entregue a quem espera: o atalho devolve o que `onAbort` produz, e a
   * corrida normal (sinal ainda não abortado) continua propagando a rejeição
   * real da promise para o chamador.
   */
  it('contrapeso: a rejeição real ainda chega ao chamador quando o sinal NÃO está abortado', async () => {
    const controller = new AbortController()
    const failure = new Error('falha real')

    await expect(abortRace(Promise.reject(failure), controller.signal, () => 'nunca')).rejects.toThrow('falha real')
  })

  it('contrapeso: o valor de sucesso ainda chega ao chamador quando o sinal NÃO está abortado', async () => {
    const controller = new AbortController()

    await expect(abortRace(Promise.resolve('ok'), controller.signal, () => 'nunca')).resolves.toBe('ok')
  })
})
