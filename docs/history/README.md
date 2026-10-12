# Histórico

Planos **concluídos**. Ficam aqui porque o raciocínio por trás de uma decisão
continua útil muito depois de a decisão ter sido executada — mas quem procura
"como o sistema funciona hoje" não deve tropeçar neles primeiro.

Nada aqui descreve trabalho pendente. Se um documento desta pasta contradiz o
código, **o código vence**: estes textos foram escritos antes de existirem.

| Documento                           | O que registra                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `dependency-reuse-refactor-plan.md` | Auditoria de reúso de dependências e as fases 0–6 que dela saíram. Tudo implementado. |
| `resilience-policy-refactor.md`     | Adoção do cockatiel para retry, breaker e bulkhead nas cadeias de provedores.         |

As rejeições de biblioteca (C1–C5) que este plano levantou **não** vivem aqui:
elas são append-only e seguem em [`../dependency-decisions.md`](../dependency-decisions.md),
que é onde uma nova decisão de dependência deve ser acrescentada.
