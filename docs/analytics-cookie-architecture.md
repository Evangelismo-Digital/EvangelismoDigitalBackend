# Arquitetura de Cookies e Analytics

> **Status:** IMPLEMENTADO · **Revisado em:** 2026-10-12 contra o código
> **Escopo:** `src/http/cookies/`, `src/http/plugins/analytics-identity.plugin.ts`,
> `src/http/middlewares/verify-analytics-proxy.middleware.ts`, `src/http/controllers/analytics/`,
> `src/use-cases/analytics/`, `src/repositories/*/prisma-analytics-repository.ts`,
> `src/lib/analytics/`, `src/lib/infra/jobs/analytics-retention.ts`, e os três modelos `Analytics*`
> em `prisma/schema.prisma`.

Este documento descreve o subsistema **como ele existe hoje**. Nasceu como especificação de correção,
com plano de execução e lista de testes a escrever; tudo aquilo foi executado e foi removido daqui —
o histórico está no git, e um plano concluído misturado à referência corrente só faz o leitor duvidar
de qual das duas coisas está lendo.

**Onde este texto divergir do código, o código vence.** Os números e nomes abaixo foram lidos dos
arquivos citados, não de memória.

---

## 1. Modelo conceitual

Três entidades, em hierarquia estrita:

| Entidade           | O que é                                        | Vive                                               |
| ------------------ | ---------------------------------------------- | -------------------------------------------------- |
| `AnalyticsVisitor` | A pessoa, através de visitas                   | Até 395 dias sem retorno                           |
| `AnalyticsSession` | Uma visita                                     | Janela de 30 min deslizante, encerrada por inércia |
| `AnalyticsEvent`   | Um acontecimento imutável dentro de uma sessão | Até 425 dias                                       |

A pergunta que o modelo existe para responder não é "quantos acessos", e sim **quando alguém entrou,
quando voltou, quais páginas acessou e quanto de cada uma efetivamente leu** — daí `durationMs` e
`scrollDepth` no evento, que distinguem ler de passar por cima.

### A invariante central: eventos não criam identidade

Só `POST /analytics/session` **cria** identificadores. Nenhuma outra rota os inventa.

Isso não é estilo. O hook anterior cunhava visitante e sessão em qualquer requisição sem eles, e o
resultado era que uma única carga de página com várias requisições paralelas criava vários visitantes,
`/health` respondia com `Set-Cookie` (tornando-o incacheável e gastando HMAC em cada sonda do load
balancer), e qualquer cliente que descartasse cookies inflava a contagem em um visitante por
requisição.

Cuidado com a formulação exata, porque é fácil errar: `/session` é a única rota que **cunha** ids —
mas não é a única que emite `Set-Cookie`. `POST /events` reenvia o **mesmo** `sessionId` com janela
renovada (`track-event.controller.ts:55`), e `/consent/revoke` e `DELETE /me` emitem `clearCookie`
para os dois cookies de identidade.

---

## 2. Inventário de cookies

Fonte única: [`src/http/cookies/options.ts`](../src/http/cookies/options.ts). Antes isso vivia
duplicado dentro do plugin, onde endurecer um cookie podia silenciosamente não endurecer o outro.

| Cookie        | Nome em produção | Nome em dev/test | Vida                        | `httpOnly` | `secure` | `sameSite` | Assinado |
| ------------- | ---------------- | ---------------- | --------------------------- | ---------- | -------- | ---------- | -------- |
| Visitante     | `__Host-ed_vid`  | `ed_vid`         | 395 dias                    | sim        | sim\*    | `lax`      | **sim**  |
| Sessão        | `__Host-ed_sid`  | `ed_sid`         | 30 min (desliza)            | sim        | sim\*    | `lax`      | **sim**  |
| Consentimento | `ed_consent`     | `ed_consent`     | 365 dias (escrito no front) | **não**    | sim\*    | `lax`      | não      |

\* `secure` é falso apenas quando `NODE_ENV` é `development` ou `test` (`isPlainHttpEnv`).

Quatro pontos que o leitor precisa saber antes de escrever um teste ou depurar um cookie que "sumiu":

- **O nome muda por ambiente.** `__Host-` é uma garantia imposta pelo navegador: ele recusa o cookie se
  não for `Secure`, se não for `Path=/`, ou se carregar `Domain`. Isso bloqueia fixação de cookie vinda
  de um subdomínio irmão comprometido, que é exatamente o ataque que um identificador de vida longa
  convida. Como o prefixo exige TLS, sobre HTTP puro usa-se o nome nu. **Um teste que fixe o nome
  prefixado na mão quebra em dev** — derive de `hostPrefixed()`.
- **A verificação de ambiente é por exclusão, não por `=== 'production'`.** A versão anterior deixava
  `staging` — valor válido do enum — servindo cookies **sem** `Secure` sobre HTTPS real.
- **`signed: true` não é só detecção de adulteração.** Um valor não assinado deixaria qualquer chamador
  apresentar o `visitorId` que quisesse e escrever eventos sobre a identidade de outra pessoa.
- **395 dias não é "mais ou menos um ano".** É o teto da CNIL que a leitura da ANPD acompanha. Escrever
  `DAYS_PER_YEAR` ali encurtaria a janela e perderia o motivo de o número ser aquele.

### Consentimento

A API **nunca escreve** `ed_consent` — o banner do front escreve, porque precisa renderizar o próprio
estado sem ida ao servidor e os Server Components do Next o leem via `cookies()`. A API apenas lê, e o
limpa na revogação. É o único cookie aqui que não carrega identificador, então visibilidade a JS não
custa nada.

Formato: `v1:analytics=1,marketing=0` ([`consent.ts`](../src/http/cookies/consent.ts)).

- Ausência, valor malformado, versão desconhecida e `0` explícito **colapsam todos em "negado"** — o
  chamador não teria ação diferente para cada caso.
- `CONSENT_VERSION` é o mecanismo de invalidação: **mude a versão e todo consentimento já dado deixa de
  contar** até a pessoa responder ao novo banner.
- Só `analytics` é consultado. `marketing` é interpretado e carregado para uso do front, mas nenhum
  caminho desta API depende dele — um portão que lê uma flag sobre a qual não age é como uma flag
  adquire, calada, um significado que nunca lhe foi dado.
- A checagem é de pertencimento ao token exato `chave=1`. `analytics=true`, `analytics` sozinho ou a
  chave repetida leem como negado. Consentimento é o lugar onde ser liberal no que se aceita é o
  instinto errado.

---

## 3. Ciclo de uma requisição

### 3.1 O guarda de proxy

Toda rota de ingestão exige o header `x-analytics-proxy` batendo com `ANALYTICS_PROXY_SECRET`
([`verify-analytics-proxy.middleware.ts`](../src/http/middlewares/verify-analytics-proxy.middleware.ts)).
A comparação passa por SHA-256 e `timingSafeEqual` — digerir antes iguala o comprimento, que é o que
torna a comparação de tempo constante utilizável com segredos de tamanhos diferentes. Um header
repetido chega como array e é **recusado** em vez de ter um dos valores escolhido.

Sem header válido: `401`.

### 3.2 A leitura de identidade — e o escopo real do hook

[`analytics-identity.plugin.ts`](../src/http/plugins/analytics-identity.plugin.ts) decora
`request.visitorId` e `request.sessionId` lendo os cookies assinados. Ele **lê e nada cunha**.

Duas recusas deliberadas:

- **Sem emissão.** Ver a invariante da §1.
- **Sem `try/catch` com fallback.** O hook antigo capturava falha de verificação e substituía por um id
  novo — ou seja, um cookie adulterado virava, em silêncio, um visitante novo. A resposta correta para
  "esta assinatura não confere" é `null`, e o evento é descartado.

> **Escopo — leia com atenção, o docblock do próprio plugin está errado neste ponto.**
> `analyticsIdentity` é registrado em `analytics.routes.ts:35`, **dentro de `ingestionRoutes`**.
> `analyticsRoutes` registra `ingestionRoutes` e `adminReadRoutes` como **irmãos**, e `fp` eleva o hook
> apenas ao escopo que o encerra. Portanto o `preHandler` roda para as rotas de ingestão e **não** para
> as rotas administrativas de leitura. Isso é inofensivo — `GET /visitors/:visitorId` tira o
> `visitorId` de `request.params`, não do cookie — mas o comentário em
> `analytics-identity.plugin.ts:76` diz que o escopo é `analyticsRoutes`, e não é.

### 3.3 Rotação de segredo

`cookieSigningSecrets(current, previous)` devolve `[current]` ou `[current, previous]`
([`cookie-secrets.ts`](../src/http/cookies/cookie-secrets.ts)). Um cookie assinado com o segredo
anterior continua válido; `unsignCookie` devolve `renew: true`, e o `/session` seguinte o reassina.

Esse `renew` é **contado** em `analytics_cookie_superseded_secret_total{cookie}`. É o único sinal que
diz se derrubar o segredo anterior invalidaria o cookie de ninguém ou o de boa parte do tráfego.

### 3.4 A janela deslizante de 30 minutos

`POST /events` reenvia o mesmo `sessionId` com `SESSION_MAX_AGE` fresco. É isso que faz a janela
deslizar a partir da **última atividade** e não do início: quem lê um texto longo por 40 minutos
deixaria, de outro modo, de ser registrado no meio da leitura.

---

## 4. Superfície HTTP

Prefixo `/analytics`. Políticas em `src/http/policies/rate-limit.ts` — note que são **quatro políticas
para seis rotas**: `/consent/revoke` reaproveita a de `session`, e `DELETE /me` a de `identify`.

| Rota                       | Guarda          | Rate limit | Corpo      | Resposta               |
| -------------------------- | --------------- | ---------- | ---------- | ---------------------- |
| `POST /session`            | proxy           | `session`  | —          | `204`                  |
| `POST /events`             | proxy           | `events`   | **16 KiB** | `204`                  |
| `POST /identify`           | proxy + JWT     | `identify` | —          | `204`                  |
| `POST /consent/revoke`     | proxy           | `session`  | —          | `204`                  |
| `DELETE /me`               | proxy + JWT     | `identify` | —          | `204`                  |
| `GET /visitors`            | JWT + **ADMIN** | `read`     | —          | lista                  |
| `GET /visitors/:visitorId` | JWT + **ADMIN** | `read`     | —          | analytics do visitante |

O teto de 16 KiB em `/events` é o que impede um lote arbitrariamente grande de ser aceito antes de
qualquer validação.

**Ingestão responde `204` em todos os caminhos de recusa** — sem consentimento, sem identidade válida,
cookie adulterado. O chamador não tem nada a fazer de diferente em nenhum deles, e distinguir só
entregaria ao atacante um oráculo sobre o que foi aceito.

`POST /identify` tira o `userId` **do JWT**, nunca do corpo. Enviar `{ userId: '<outra-pessoa>' }` não
tem efeito.

---

## 5. Modelo de dados

Três modelos em `prisma/schema.prisma`, todos com `uuid(7)` como chave primária (ordenável no tempo,
o que mantém a inserção sequencial no índice).

### Cascatas — é o que decide o que o apagamento realmente apaga

| Relação                    | `onDelete` | Consequência                                           |
| -------------------------- | ---------- | ------------------------------------------------------ |
| `AnalyticsVisitor.user`    | `SetNull`  | Excluir a conta **anonimiza** o histórico; não o apaga |
| `AnalyticsSession.visitor` | `Cascade`  | Apagar o visitante leva as sessões                     |
| `AnalyticsSession.user`    | `SetNull`  | Idem conta                                             |
| `AnalyticsEvent.session`   | `Cascade`  | Apagar a sessão leva os eventos                        |

O `SetNull` na conta é deliberado: apagamento completo é **ato explícito do titular** via
`DELETE /analytics/me`, não efeito colateral de encerrar a conta.

### Campos que carregam decisão

- **Primeiro toque** no visitante (`firstUtmSource/Medium/Campaign`, `firstLandingPath`): preservados
  para atribuição e imunes a UTMs posteriores.
- **`ipAddress` na sessão já chega truncado** (§6). A string crua de user-agent **não é persistida** —
  só `browser`, `os`, `device`.
- `isBounce` nasce `true` e `pageViewCount`/`eventCount` nascem em `0`.

---

## 6. Privacidade

### Minimização

- **IP**: truncado a **/24** (IPv4) ou **/48** (IPv6) antes de gravar
  ([`truncate-ip.ts`](../src/lib/analytics/truncate-ip.ts)), via `ipaddr.js`. O IP completo permanece
  em `AuthenticationAudit`, onde há base legal de segurança para retê-lo.
  Uma regressão fixa o caso que já quebrou: um IPv6 comprimido não pode ser gravado sem truncar —
  `compressed-ipv6-stored-no-address.regression.spec.ts`.
- **User-agent**: interpretado em três categorias grossas e descartado. A string crua é vetor de
  fingerprinting sem ganho analítico sobre esses três campos.

### Retenção

Varredura diária às 04:00 (job de manutenção; ver `CLAUDE.md`), em
[`analytics-retention.ts`](../src/lib/infra/jobs/analytics-retention.ts), sob `DistributedLock`.

| Alvo                 | Padrão (env)                                                  |
| -------------------- | ------------------------------------------------------------- |
| `analytics_events`   | 425 dias (`ANALYTICS_RETENTION_EVENTS_DAYS`)                  |
| `analytics_sessions` | 425 dias (`ANALYTICS_RETENTION_SESSIONS_DAYS`)                |
| `analytics_visitors` | 395 dias de inatividade (`ANALYTICS_RETENTION_VISITORS_DAYS`) |

**A ordem é parte da especificação**: eventos → sessões → visitantes. Apagar as folhas primeiro mantém
cada cascata pequena e previsível, em vez de deixar a remoção de um visitante derrubar centenas de
milhares de linhas numa só instrução. Lotes de 1.000, no máximo 100 lotes por execução.

### Revogação e apagamento

- `POST /consent/revoke` limpa os três cookies **incondicionalmente e antes de qualquer coisa que possa
  falhar** — quem revoga nunca pode terminar com cookies ainda postos porque o delete deu erro — e só
  então apaga os dados daquele visitante.
- `DELETE /analytics/me` (JWT) apaga por `userId`.

---

## 7. Observabilidade

Três contadores em [`analytics-metrics.ts`](../src/lib/metrics/analytics-metrics.ts):

| Métrica                                            | Para quê                                       |
| -------------------------------------------------- | ---------------------------------------------- |
| `analytics_retention_deleted_total{table}`         | Volume apagado por tabela na varredura         |
| `analytics_retention_runs_total`                   | Execuções da varredura                         |
| `analytics_cookie_superseded_secret_total{cookie}` | Cookies ainda assinados com o segredo anterior |

Todos usam `?.` porque com `METRICS_ENABLED=false` o registry não existe e os módulos exportam `null`.

---

## 8. Contrato com o frontend

O que esta API assume do Next.js, e só isso:

1. **O proxy first-party.** O front reescreve `/analytics/*` para a API e injeta
   `x-analytics-proxy: <ANALYTICS_PROXY_SECRET>`. Isso é o que mantém os cookies **first-party** — e é
   por isso que a alternativa `SameSite=None` + CHIPS, que a especificação original guardava como plano
   de contingência, nunca precisou ser construída e não existe no código.
2. **O banner escreve `ed_consent`** no formato `v1:analytics=1,marketing=0`. A API não o escreve.
3. **Chamar `POST /session`** no início da navegação; é o único ponto que cria identidade.
4. **`credentials` same-origin**: como tudo passa pelo proxy, não é preciso `include`.
