# docs

Documentos que descrevem **o sistema como ele é hoje**. Planos já concluídos
ficam em [`history/`](history/), para que ninguém tropece neles procurando
referência corrente.

Regra que vale para tudo aqui: **onde um documento divergir do código, o código
vence** — e o documento está com defeito, não o código.

## Referência corrente

| Documento                                                                                                                | O que é                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [`analytics-cookie-architecture.md`](analytics-cookie-architecture.md)                                                   | Especificação do subsistema de cookies e analytics. **Implementado** — é a referência do que existe.                              |
| [`dependency-decisions.md`](dependency-decisions.md)                                                                     | Log **append-only** de decisões de dependência (C1–C5 e as que vierem). É aqui que uma nova decisão entra.                        |
| [`sonarqube-quality-gate.md`](sonarqube-quality-gate.md)                                                                 | Toda regra silenciada e o porquê, incluindo os dois casos em que seguir a ferramenta introduziria um bug. Citado pelo CLAUDE.md.  |
| [`integration-testing.md`](integration-testing.md)                                                                       | Como rodar as suítes de integração e qual projeto do vitest cobre o quê.                                                          |
| [`monitoring-verification.md`](monitoring-verification.md)                                                               | Runbook de validação da stack de observabilidade ponta a ponta.                                                                   |
| [`timeout-and-cancellation-model.md`](timeout-and-cancellation-model.md)                                                 | O modelo de deadline/cancelamento. Plano concluído, mas **12 arquivos de `src/` o citam pelo caminho** — por isso não foi movido. |
| [`architecture-assessment-BullMQ-native-jobs-and-routing.md`](architecture-assessment-BullMQ-native-jobs-and-routing.md) | Avaliação de BullMQ nativo + roteamento. **Ainda vivo**: é o único registro de 5 defeitos em aberto, listados no topo dele.       |
| [`nestjs-folder-organization-refactor-plan.md`](nestjs-folder-organization-refactor-plan.md)                             | Plano fase a fase (Fases 0–8) para reorganizar `src/` seguindo as convenções de módulos e pastas do NestJS (`modules/`, `common/`, `config/`, `infra/`). |

## O que está em aberto

O item com maior consequência mora no documento de avaliação do BullMQ: **a
outbox não tem `claim()`/CAS**, e é esse o pré-requisito real para um segundo
pod de worker. A manutenção agendada já é segura com N pods (Job Schedulers do
BullMQ), mas o fan-out de pub/sub do `OutboxSignal` não é.

## Convenções

- Documento que vira história ganha um **banner de status** no topo e vai para
  `history/`, em vez de ser apagado — menos quando todo o seu conteúdo já foi
  executado e suas referências apodreceram (foi o caso do `Audit_Report.md`,
  removido em 2026-10-12; o git guarda).
- Links entre documentos são **relativos**. Nunca `file:///home/...`: um caminho
  absoluto da máquina de alguém nasce quebrado para todo mundo.
