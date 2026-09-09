# Arquitetura de Cookies e Analytics — Especificação de Correção

> **Status:** proposta técnica · **Escopo:** `src/http/plugins/analytics.plugin.ts`, `src/env/index.ts`, `src/app.ts`, `src/http/controllers/analytics/*`, `prisma/schema.prisma` · **Frontend afetado:** Next.js 16 (App Router)

Este documento fecha os 8 problemas levantados na auditoria da camada de cookies e redesenha o subsistema para o objetivo real do produto: **saber quando um usuário entrou, quando voltou, quais páginas acessou e quanto de cada uma ele efetivamente leu — com identidade vinculada ao `userId` quando autenticado.**

---

## Sumário executivo

O desenho atual trata cookie como detalhe de infraestrutura. O objetivo pedido exige tratá-lo como **identidade de longo prazo**, e isso muda três decisões de raiz:

1. **Front e API são sites diferentes.** Em 2026 isso significa que um cookie de terceiro **não sobrevive** — Safari (ITP) bloqueia integralmente, Firefox particiona por padrão, Chrome restringe. `SameSite=None` não resolve; só adia. A arquitetura passa a rotear analytics por um **proxy first-party no Next.js**, tornando o cookie primário do ponto de vista do browser. Isto é o item mais estrutural do documento.
2. **Eventos deixam de criar identidade.** Hoje qualquer `POST` sem cookie cunha um visitante novo. Passa a existir **um único endpoint de bootstrap** autorizado a emitir cookie. Isso mata de uma vez a corrida de emissão (item 3), o crescimento ilimitado de tabela (item 6) e a inflação de "visitantes únicos".
3. **O modelo de dados ganha uma entidade `Visitor`.** "Quando entrou" e "quando voltou" não são deriváveis do schema atual, que só tem `createdAt` por sessão.

### Rastreabilidade dos 8 itens

| # | Problema | Onde é resolvido | Severidade |
|---|---|---|---|
| 1 | `COOKIE_SECRET` com default versionado, válido em produção | [§4.1](#41-segredos-item-1) | **Alta** |
| 2 | `SameSite=Lax` quebra tracking cross-site | [§2](#2-decisão-estrutural-proxy-first-party) | **Alta** |
| 3 | Corrida de emissão → N visitantes por page load | [§3.2](#32-invariante-central-eventos-não-criam-identidade) | Média |
| 4 | Hook global emite cookie em toda rota | [§3.3](#33-escopo-do-hook-item-4) | Média |
| 5 | `session_id` sem expiração real | [§3.4](#34-janela-de-sessão-deslizante-item-5) | Média |
| 6 | Ingestão anônima sem limites de conteúdo | [§4.2](#42-superfície-de-ingestão-item-6) | Média |
| 7 | LGPD: sem consentimento, retenção ou anonimização | [§5](#5-base-legal-consentimento-e-retenção-item-7) | **Alta** (regulatória) |
| 8 | `secure` ignora staging, sem `__Host-`, código morto | [§4.3](#43-endurecimento-dos-atributos-item-8) | Baixa |

### Nota sobre `userId` e "todos os dados"

O pedido é explícito e será entregue por inteiro. Registro o trade-off uma vez, sem bloquear: vincular `userId` a um identificador de 13 meses que carrega IP, user-agent e histórico de navegação transforma telemetria agregada em **dado pessoal identificável** sob a LGPD. Isso não impede nada — apenas move o requisito de "boa prática" para "obrigação": base legal declarada, consentimento para o que não for essencial, direito de exclusão e prazo de retenção. A §5 entrega esses controles como parte do desenho, e não como um adendo opcional.

---

## 1. Modelo conceitual

Três níveis de identidade, com tempos de vida distintos:

```
Visitor  ──1:N──>  Session  ──1:N──>  Event
(13 meses)         (30 min ocioso)     (imutável)
   │                   │
   └── userId? ────────┘   vinculado no login (identity stitching)
```

| Entidade | Pergunta que responde | Portador |
|---|---|---|
| **Visitor** | "Quem é este navegador? Quando entrou pela 1ª vez? Quando voltou?" | cookie `__Host-ed_vid`, 13 meses |
| **Session** | "Qual foi esta visita? Duração, origem, campanha?" | cookie `__Host-ed_sid`, 30 min deslizantes |
| **Event** | "O que aconteceu? Qual página, quanto tempo, quanto rolou?" | nenhum — persistido |
| **Consent** | "O que este visitante autorizou?" | cookie `ed_consent`, legível por JS |

---

## 2. Decisão estrutural: proxy first-party

### O problema

Front (`https://app.exemplo.com.br`) e API (`https://api.outrodominio.com`) são **sites** diferentes — eTLD+1 distintos. Um `Set-Cookie` da API é, para o browser, cookie de terceiro:

| Browser | Comportamento com `SameSite=None; Secure` |
|---|---|
| Safari (ITP) | **Bloqueia.** Cookie nunca é armazenado. |
| Firefox (TCP) | Particiona por site de topo. Funciona, isolado. |
| Chrome | Restringe progressivamente; exige `Partitioned` (CHIPS). |

Resultado prático se nada mudar: em Safari, **todo request cunha um visitante novo**. A métrica de "visitantes únicos" vira uma contagem de requisições, e "quando voltou" é impossível de responder.

### A solução: rewrite no Next.js

O browser fala **apenas** com a origem do front. O Next encaminha para a API server-side.

```ts
// next.config.ts  — Next.js 16
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/_a/:path*',                       // caminho opaco, resistente a adblock
        destination: `${process.env.ANALYTICS_API_ORIGIN}/analytics/:path*`,
      },
    ]
  },
}

export default nextConfig
```

O browser vê `POST https://app.exemplo.com.br/_a/events`. O `Set-Cookie` que a API devolve atravessa o rewrite e é interpretado como **originário de `app.exemplo.com.br`** — primeiro-partido, imune a ITP/TCP.

Ganhos colaterais que justificam a escolha sozinhos:

- **`__Host-` volta a ser possível** — o prefixo exige `Secure`, `Path=/` e ausência de `Domain`; blinda contra fixação de cookie a partir de subdomínio comprometido.
- **`SameSite=Lax` volta a ser o correto** — sem `None`, sem CHIPS, sem depender de política de terceiros.
- **`navigator.sendBeacon` funciona.** Beacon não permite headers customizados e é a única forma confiável de enviar evento em `visibilitychange`. Same-origin, ele leva os cookies. Cross-site, é sabotado pelo bloqueio de terceiros. Sem isso não há como medir *tempo de leitura* — o dado mais valioso do pedido.
- **CORS deixa de existir nessa rota.** Menos superfície.

> **Autenticidade do encaminhamento.** O rewrite roda no servidor do Next, então a API precisa distinguir "veio do proxy" de "veio da internet aberta". Duas medidas combinadas: header compartilhado `X-Analytics-Proxy: <segredo>` validado na API, e `trustProxy` já ativo em `app.ts:26` preservando o IP real via `X-Forwarded-For`. Sem o header, a rota responde `401`.

### Plano B — se o proxy for inviável

Só então, e assumindo perda conhecida de cobertura em Safari:

```ts
const TRACKING_COOKIE_OPTIONS = {
  path: '/',
  httpOnly: true,
  secure: true,           // obrigatório com SameSite=None
  sameSite: 'none',
  partitioned: true,      // CHIPS — exigido pelo Chrome
  signed: true,
} as const
```

E no front, todo `fetch` precisa de `credentials: 'include'`. Documente a lacuna de Safari em vez de descobri-la no dashboard.

---

## 3. Especificação do runtime

### 3.1 Inventário de cookies

| Nome | Vida | Conteúdo | Flags |
|---|---|---|---|
| `__Host-ed_vid` | 13 meses | UUIDv7 opaco, assinado | `HttpOnly` `Secure` `SameSite=Lax` `Path=/` |
| `__Host-ed_sid` | 30 min **deslizantes** | UUIDv7 opaco, assinado | `HttpOnly` `Secure` `SameSite=Lax` `Path=/` |
| `ed_consent` | 12 meses | `v1:analytics=1,marketing=0` | `Secure` `SameSite=Lax` — **sem** `HttpOnly` |

Regras invioláveis:

- **O valor do cookie é sempre opaco.** UUID e nada mais. Zero PII, zero `userId`, zero JSON. Toda semântica vive no banco, atrás do identificador. Um cookie vazado não revela nada por si.
- **13 meses** é o teto alinhado à prática consolidada (CNIL, e a leitura da ANPD que a acompanha). Não use "1 ano" arbitrário — use o teto e documente-o.
- `ed_consent` é deliberadamente legível por JS: o banner precisa renderizar seu estado sem round-trip, e Server Components do Next precisam lê-lo via `cookies()`.

### 3.2 Invariante central: eventos não criam identidade

> **Somente `POST /analytics/session` emite cookie. Nenhuma outra rota, em nenhuma circunstância.**

```
Browser                          Next (proxy)              API
   │                                 │                      │
   │ 1. boot: POST /_a/session ──────┼──────────────────────>│
   │                                 │      valida consent   │
   │                                 │      cunha vid + sid  │
   │<──── 204 + Set-Cookie ×2 ───────┼──────────────────────│
   │                                 │                      │
   │ 2. POST /_a/events (com cookie) ┼──────────────────────>│
   │                                 │   sem cookie válido?  │
   │                                 │   → 204, descarta     │
```

Isto resolve três itens de uma vez:

- **Item 3 (corrida):** um único request cunha. O client bloqueia a fila de eventos até ele resolver — não há dois mints concorrentes.
- **Item 6 (crescimento de tabela):** um bot que não guarda cookie recebe `204` e **não gera linha**. A porta de escrita passa a exigir uma ida e volta com estado.
- **Contagem correta:** `visitor_id` deixa de inflar.

O descarte é silencioso (`204`, não `400`): um erro visível ensina o atacante o que corrigir, e o front não tem o que fazer com a falha.

### 3.3 Escopo do hook (item 4)

O plugin deixa de ser global. Registrado **dentro** de `analyticsRoutes`, não na raiz.

```ts
// src/app.ts — remover a linha 70:
// app.register(analytics)   ← sai daqui
```

```ts
// src/http/controllers/analytics/analytics.routes.ts
import { analyticsIdentity } from '@http/plugins/analytics-identity.plugin'

export async function analyticsRoutes(app: FastifyInstance) {
  await app.register(analyticsIdentity)   // encapsulado: só vale neste escopo

  app.post('/session',  { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.session } }, startSession)
  app.post('/events',   { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.events  }, bodyLimit: 16 * 1024 }, trackEvent)
  app.post('/identify', { config: { rateLimit: HTTP_RATE_LIMIT_POLICIES.analytics.identify } }, identifyVisitor)
}
```

Note o `await app.register(...)` **sem** `fastify-plugin`: é justamente o encapsulamento que se quer aqui. Envolver com `fp` reintroduziria o vazamento para a raiz.

O que isso conserta: `/health` para de responder com `Set-Cookie` (respostas voltam a ser cacheáveis por CDN), o health-check do load balancer para de gastar HMAC 24/7, e clientes não-browser param de cunhar UUID descartável.

### 3.4 Janela de sessão deslizante (item 5)

A sessão expira por **inatividade de 30 minutos**, não por fechamento de aba. Sem consulta ao banco: o próprio `maxAge` é o relógio.

- Cookie de sessão presente e válido → renova `maxAge` para +30 min a cada evento.
- Cookie ausente/expirado → **nova sessão**, `sessionCount` do visitante incrementa.
- Opcional, alinhado ao comportamento do GA: mudança de campanha UTM força nova sessão.

O modelo ganha `startedAt` / `lastSeenAt` / `endedAt`, tornando duração de sessão uma coluna e não um `GROUP BY` frágil.

### 3.5 O plugin reescrito

```ts
// src/http/plugins/analytics-identity.plugin.ts
import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import { cookieOptions, VISITOR_MAX_AGE, SESSION_MAX_AGE } from '@http/cookies/options'

export const VISITOR_COOKIE = '__Host-ed_vid'
export const SESSION_COOKIE = '__Host-ed_sid'

declare module 'fastify' {
  interface FastifyRequest {
    /** null quando o portador não apresentou cookie assinado válido. */
    visitorId: string | null
    sessionId: string | null
  }
}

function readSigned(request: FastifyRequest, name: string): string | null {
  const raw = request.cookies[name]

  if (!raw) {
    return null
  }

  const unsigned = request.unsignCookie(raw)

  // `valid: false` cobre assinatura adulterada; checar o valor cobre o cookie vazio.
  return unsigned.valid && unsigned.value ? unsigned.value : null
}

/**
 * Só lê. A emissão vive no controller de `/session`, que é o único ponto
 * autorizado a criar identidade — ver §3.2.
 */
const analyticsIdentityPlugin: FastifyPluginAsync = async (app) => {
  app.decorateRequest('visitorId', null)
  app.decorateRequest('sessionId', null)

  app.addHook('preHandler', async (request) => {
    request.visitorId = readSigned(request, VISITOR_COOKIE)
    request.sessionId = readSigned(request, SESSION_COOKIE)
  })
}

export const analyticsIdentity = analyticsIdentityPlugin   // sem fp: encapsulado de propósito
```

```ts
// src/http/cookies/options.ts — fonte única da verdade dos atributos
import { env } from '@env/index'
import { SECONDS_PER_DAY } from 'core/constants/time'

export const VISITOR_MAX_AGE = SECONDS_PER_DAY * 395   // 13 meses — teto documentado
export const SESSION_MAX_AGE = 60 * 30                 // 30 min, renovado a cada evento

/**
 * `secure` desligado apenas onde não há TLS. A checagem anterior era
 * `NODE_ENV === 'production'`, que deixava `staging` — valor válido do enum em
 * `env/index.ts:8` — servindo cookie sem Secure sobre HTTPS.
 */
const isPlainHttp = env.NODE_ENV === 'development' || env.NODE_ENV === 'test'

export const cookieOptions = {
  path: '/',
  httpOnly: true,
  secure: !isPlainHttp,
  sameSite: 'lax',
  signed: true,
} as const
```

> **Atenção ao `__Host-` em desenvolvimento.** O prefixo exige `Secure`, que o browser recusa em `http://localhost`... exceto que `localhost` é tratado como *secure context* e o Chrome/Firefox aceitam `Secure` ali. Se o seu dev roda em `http://` num host que não seja `localhost`, derive o nome do cookie: `const VISITOR_COOKIE = isPlainHttp ? 'ed_vid' : '__Host-ed_vid'`.

```ts
// src/http/controllers/analytics/start-session.controller.ts
export async function startSession(request: FastifyRequest, reply: FastifyReply) {
  if (!hasAnalyticsConsent(request)) {
    return reply.code(HTTP_STATUS.NO_CONTENT).send()   // sem consentimento, sem identidade
  }

  // Visitante recorrente mantém o vid; só a sessão é nova.
  const visitorId = request.visitorId ?? randomUUID()
  const sessionId = randomUUID()

  reply.setCookie(VISITOR_COOKIE, visitorId, { ...cookieOptions, maxAge: VISITOR_MAX_AGE })
  reply.setCookie(SESSION_COOKIE, sessionId, { ...cookieOptions, maxAge: SESSION_MAX_AGE })

  const result = await makeStartAnalyticsSessionUseCase().execute({
    visitorId,
    sessionId,
    isNewVisitor: request.visitorId === null,
    userId: getUserId() ?? null,
    ...sessionContext(request),
  })

  if (isErr(result)) {
    return HttpErrorMapper.map(result.error, reply)
  }

  return reply.code(HTTP_STATUS.NO_CONTENT).send()
}
```

### 3.6 `userId` sem reordenar plugins

`requestLifecycle` já resolve o JWT e chama `setUserId()` no AsyncLocalStorage (`request-lifecycle.plugin.ts:14`). Ele é registrado em `app.ts:78`, **depois** do analytics — então um hook `onRequest` de analytics não enxergaria o `userId`.

Não é preciso mexer na ordem. Controllers rodam depois de **todos** os `onRequest`, então basta ler do ALS lá dentro:

```ts
import { getUserId } from '@lib/logger'

const userId = getUserId() ?? null   // User.publicId, ou null se anônimo
```

Nenhum decorator novo, nenhuma re-verificação de JWT, nenhuma reordenação. A infraestrutura que já existe responde à pergunta.

### 3.7 Identity stitching

Uma visita começa anônima e pode se autenticar no meio. `POST /analytics/identify`, chamado pelo front logo após o login bem-sucedido, costura as duas metades:

```ts
// use-case, em transação
await tx.analyticsVisitor.update({ where: { visitorId }, data: { userId } })
await tx.analyticsSession.updateMany({ where: { sessionId }, data: { userId } })

// Retroativo — governado por flag, porque é uma escolha de privacidade, não técnica.
if (env.ANALYTICS_BACKFILL_IDENTITY) {
  await tx.analyticsSession.updateMany({
    where: { visitorId, userId: null },
    data: { userId },
  })
}
```

Regra de segurança que não pode ser negociada: **`userId` nunca vem do corpo da requisição.** Sai sempre de `getUserId()`, isto é, do JWT verificado. Aceitar do body seria permitir que qualquer um atribuísse a navegação de terceiros a si — ou a outro.

E no **logout**, o front chama `POST /analytics/session` de novo para rotacionar `sid`: sem isso, a navegação do próximo usuário no mesmo browser continuaria na sessão do anterior.

---

## 4. Endurecimento

### 4.1 Segredos (item 1)

```ts
// src/env/index.ts
COOKIE_SECRET: z.string().min(32, 'Cookie secret must be at least 32 characters long'),
COOKIE_SECRET_PREVIOUS: z.string().min(32).optional(),   // janela de rotação
ANALYTICS_PROXY_SECRET: z.string().min(32),
```

O `.default(...)` **sai**. O valor que estava lá — `'super-secret-cookie-signing-key-for-local-development-must-be-long'` — está versionado no repositório e valia em qualquer `NODE_ENV`, inclusive produção: bastava esquecer a variável no deploy para o servidor subir assinando com uma chave pública. `JWT_SECRET`, na linha 47, já era declarado sem default; isto apenas alinha os dois.

Para não quebrar o ambiente local, injete o valor de desenvolvimento no `.env.example` e no `.env.test` (ambos versionados e já cumprindo esse papel), nunca no schema.

**Rotação sem invalidar 13 meses de cookies** — `@fastify/cookie` aceita array: assina com o primeiro, valida com qualquer um.

```ts
// src/app.ts
app.register(fastifyCookie, {
  secret: [env.COOKIE_SECRET, env.COOKIE_SECRET_PREVIOUS].filter(Boolean) as string[],
})
```

Procedimento: promova o atual para `COOKIE_SECRET_PREVIOUS`, gere um novo, faça deploy, e remova o antigo depois de uma janela ≥ vida do cookie de sessão.

### 4.2 Superfície de ingestão (item 6)

O schema atual não tem teto algum — `eventType` e `path` são `z.string().min(1)` e `payload` é `z.record(z.string(), z.any())`. Com o `bodyLimit` padrão de 1 MiB do Fastify e 300 req/min/IP, isso é ~300 MB/min/IP de JSON arbitrário indo para o Postgres, sem forjar nada.

```ts
// src/http/schemas/analytics/track-event-schema.ts
export const EVENT_TYPES = [
  'page_view', 'page_exit', 'click', 'form_start',
  'form_submit', 'scroll_depth', 'search', 'outbound_click',
] as const

export const trackEventSchema = z.object({
  eventType: z.enum(EVENT_TYPES),                    // allowlist, não string livre
  path:      z.string().min(1).max(2048),
  title:     z.string().max(512).optional(),
  referrer:  z.url().max(2048).optional(),
  durationMs:  z.number().int().min(0).max(86_400_000).optional(),
  scrollDepth: z.number().int().min(0).max(100).optional(),
  payload: z.record(z.string(), z.union([z.string().max(512), z.number(), z.boolean(), z.null()]))
    .refine((p) => Object.keys(p).length <= 20, 'payload: máximo de 20 chaves')
    .optional(),
})

/** Lote: reduz round-trips e é o formato natural do sendBeacon. */
export const trackEventsBatchSchema = z.object({
  events: z.array(trackEventSchema).min(1).max(50),
})
```

Camadas somadas:

| Camada | Controle |
|---|---|
| Transporte | `bodyLimit: 16 KiB` na rota (vs. 1 MiB global) |
| Schema | allowlist de `eventType`, `.max()` em todo string, `payload` sem aninhamento |
| Identidade | sem cookie assinado válido → `204` sem escrita (§3.2) |
| Taxa | política dedicada `analytics.*`, mais restrita que a global de 300/min |
| Proxy | `X-Analytics-Proxy` obrigatório → `401` |

```ts
// src/http/policies/rate-limit.ts
analytics: {
  session:  { max: env.HTTP_RATE_LIMIT_ANALYTICS_SESSION_MAX,  timeWindow: '1 minute' },  // ~5
  events:   { max: env.HTTP_RATE_LIMIT_ANALYTICS_EVENTS_MAX,   timeWindow: '1 minute' },  // ~60
  identify: { max: env.HTTP_RATE_LIMIT_ANALYTICS_IDENTIFY_MAX, timeWindow: '1 minute' },  // ~5
},
```

### 4.3 Endurecimento dos atributos (item 8)

| Correção | Antes | Depois |
|---|---|---|
| Prefixo `__Host-` | `visitor_id` | `__Host-ed_vid` — impede fixação via subdomínio |
| `secure` em staging | `NODE_ENV === 'production'` | `!isPlainHttp` — cobre staging |
| Código morto | `request.visitorId \|\| randomUUID()` (nunca atribuído antes) | removido com o `try/catch` |
| Fonte da verdade | opções inline no plugin | `src/http/cookies/options.ts` |

Sobre o `try/catch` que sumiu: ele existia para degradar em IDs efêmeros quando `unsignCookie` lançasse. Na arquitetura nova isso não faz mais sentido — se a leitura falha, a resposta correta é `visitorId = null` e descarte do evento, não inventar um visitante. Falhar em silêncio para o cliente, alto no log.

**Além dos cookies**, três headers que fecham o resto da superfície:

```ts
// no reply de toda resposta de analytics
reply.header('Cache-Control', 'no-store')            // resposta com Set-Cookie nunca entra em cache
reply.header('Vary', 'Origin')
reply.header('X-Content-Type-Options', 'nosniff')
```

---

## 5. Base legal, consentimento e retenção (item 7)

Com `userId`, IP e user-agent ligados a um identificador de 13 meses, o dado é pessoal e identificável. Os controles abaixo são parte da entrega.

### 5.1 Portão de consentimento

Cookie `ed_consent`, legível por JS, com versionamento explícito (`v1:`) para que uma mudança de política invalide consentimentos antigos.

| Estado | Comportamento do backend |
|---|---|
| Ausente | `/session` responde `204` sem emitir cookie. Front só exibe o banner. |
| `analytics=0` | Nenhuma identidade, nenhuma escrita. Opcionalmente, contador agregado sem identificador. |
| `analytics=1` | Fluxo completo desta especificação. |

A revogação apaga: `clearCookie` nos três cookies **e** `DELETE` das linhas do visitante — não basta parar de coletar.

### 5.2 Minimização

```ts
/**
 * IP entra no banco truncado: /24 em IPv4, /48 em IPv6. Preserva geolocalização
 * de cidade — que é o uso real — e descarta a identificação de dispositivo.
 * O IP completo continua disponível em `AuthenticationAudit`, onde há base legal
 * de segurança para retê-lo.
 */
function truncateIp(ip: string): string {
  if (ip.includes(':')) {
    return ip.split(':').slice(0, 3).join(':') + '::'
  }
  return ip.split('.').slice(0, 3).join('.') + '.0'
}
```

Guarde `userAgent` já parseado (browser, OS, device) e descarte a string crua — ela é um vetor de fingerprinting sem ganho analítico.

### 5.3 Retenção

Job BullMQ diário (`bullmq@5.81.4` já está no projeto), com os prazos em env:

| Tabela | Prazo | Ação |
|---|---|---|
| `analytics_events` | 14 meses | `DELETE` |
| `analytics_sessions` | 14 meses | `DELETE` (cascata já existe na FK) |
| `analytics_visitors` | 13 meses sem atividade | `DELETE` |

E um caso de uso `deleteVisitorData(userId)` acionável pelo titular — a LGPD dá esse direito e ele precisa de código, não de política.

---

## 6. Modelo de dados

```prisma
model AnalyticsVisitor {
  id          String   @id @default(uuid(7))
  visitorId   String   @unique @map("visitor_id")

  // Responde diretamente a "quando entrou" e "quando voltou".
  firstSeenAt DateTime @default(now()) @map("first_seen_at")
  lastSeenAt  DateTime @updatedAt      @map("last_seen_at")
  sessionCount Int     @default(1)     @map("session_count")

  // Primeiro toque: preservado para atribuição, imune a UTMs posteriores.
  firstUtmSource   String? @map("first_utm_source")
  firstUtmMedium   String? @map("first_utm_medium")
  firstUtmCampaign String? @map("first_utm_campaign")
  firstLandingPath String? @map("first_landing_path")

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [publicId], onDelete: SetNull)

  sessions AnalyticsSession[]

  @@index([userId])
  @@index([lastSeenAt])
  @@map("analytics_visitors")
}

model AnalyticsSession {
  id        String @id @default(uuid(7))
  sessionId String @unique @map("session_id")

  visitorId String           @map("visitor_id")
  visitor   AnalyticsVisitor @relation(fields: [visitorId], references: [visitorId], onDelete: Cascade)

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [publicId], onDelete: SetNull)

  startedAt DateTime  @default(now()) @map("started_at")
  lastSeenAt DateTime @updatedAt      @map("last_seen_at")
  endedAt   DateTime?                 @map("ended_at")
  durationMs Int?                     @map("duration_ms")

  ipAddress String? @map("ip_address")     // truncado — ver §5.2
  country   String?
  region    String?
  city      String?

  browser  String?
  os       String?
  device   String?                          // mobile | tablet | desktop
  language String?

  referrer       String? // referrer externo da 1ª página
  landingPath    String? @map("landing_path")
  exitPath       String? @map("exit_path")
  pageViewCount  Int     @default(0) @map("page_view_count")
  eventCount     Int     @default(0) @map("event_count")
  isBounce       Boolean @default(true) @map("is_bounce")

  utmSource   String? @map("utm_source")
  utmMedium   String? @map("utm_medium")
  utmCampaign String? @map("utm_campaign")
  utmTerm     String? @map("utm_term")
  utmContent  String? @map("utm_content")

  events AnalyticsEvent[]

  @@index([visitorId])
  @@index([userId])
  @@index([startedAt])
  @@index([utmCampaign])
  @@map("analytics_sessions")
}

model AnalyticsEvent {
  id        String           @id @default(uuid(7))
  sessionId String           @map("session_id")
  session   AnalyticsSession @relation(fields: [sessionId], references: [sessionId], onDelete: Cascade)

  eventType String @map("event_type")
  path      String
  title     String?
  referrer  String?          // referrer interno: de qual página veio

  // O núcleo de "quais páginas leu", em oposição a apenas "acessou".
  durationMs  Int? @map("duration_ms")
  scrollDepth Int? @map("scroll_depth")   // 0–100

  payload    Json?
  occurredAt DateTime @default(now()) @map("occurred_at")

  @@index([sessionId])
  @@index([eventType, occurredAt])
  @@index([path])
  @@map("analytics_events")
}
```

No `model User`, adicione o lado inverso:

```prisma
  analyticsVisitors AnalyticsVisitor[]
  analyticsSessions AnalyticsSession[]
```

> **Uma nota sobre a FK atual.** `AnalyticsEvent.session` já referencia `AnalyticsSession.sessionId` (não a PK). É legítimo, porque a coluna é `@unique`, e mantê-lo evita uma migração de dados. `AnalyticsVisitor` segue o mesmo padrão por consistência.

### Consultas que o modelo passa a responder

```sql
-- "Quando o usuário X entrou pela primeira vez e quando voltou?"
SELECT first_seen_at, last_seen_at, session_count
FROM analytics_visitors WHERE user_id = $1;

-- "Quais páginas ele leu de fato?" — leitura, não passagem
SELECT e.path, e.title, e.duration_ms, e.scroll_depth, e.occurred_at
FROM analytics_events e
JOIN analytics_sessions s ON s.session_id = e.session_id
WHERE s.user_id = $1 AND e.event_type = 'page_view'
  AND e.duration_ms > 10000 AND e.scroll_depth > 50
ORDER BY e.occurred_at DESC;

-- "Qual o intervalo entre visitas?"
SELECT started_at, LAG(started_at) OVER (PARTITION BY visitor_id ORDER BY started_at) AS previous_visit
FROM analytics_sessions WHERE user_id = $1;
```

---

## 7. Integração com o Next.js 16

Em App Router, navegação client-side **não recarrega a página** — sem instrumentação explícita, só o primeiro `page_view` de cada visita é registrado.

```tsx
// app/providers/analytics-provider.tsx
'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'

const ENDPOINT = '/_a'   // proxy first-party — §2

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const ready = useRef<Promise<void> | null>(null)
  const entered = useRef<number>(Date.now())
  const maxScroll = useRef<number>(0)

  // Bootstrap único: nenhum evento parte antes de a identidade existir (§3.2).
  if (ready.current === null) {
    ready.current = fetch(`${ENDPOINT}/session`, { method: 'POST', keepalive: true })
      .then(() => undefined)
      .catch(() => undefined)   // analytics nunca quebra a página
  }

  useEffect(() => {
    const onScroll = () => {
      const pct = Math.round(
        ((window.scrollY + window.innerHeight) / document.body.scrollHeight) * 100,
      )
      maxScroll.current = Math.max(maxScroll.current, Math.min(pct, 100))
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    entered.current = Date.now()
    maxScroll.current = 0

    void ready.current?.then(() =>
      fetch(`${ENDPOINT}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: [{
            eventType: 'page_view',
            path: pathname,
            title: document.title,
            referrer: document.referrer || undefined,
          }],
        }),
      }).catch(() => undefined),
    )

    // O evento de saída é o que mede leitura. `sendBeacon` é a única API que
    // sobrevive ao descarregamento da página — e ela só carrega cookies porque
    // o proxy tornou a chamada same-origin (§2).
    const flush = () => {
      if (document.visibilityState !== 'hidden') {
        return
      }

      navigator.sendBeacon(
        `${ENDPOINT}/events`,
        new Blob([JSON.stringify({
          events: [{
            eventType: 'page_exit',
            path: pathname,
            durationMs: Date.now() - entered.current,
            scrollDepth: maxScroll.current,
          }],
        })], { type: 'application/json' }),
      )
    }

    document.addEventListener('visibilitychange', flush)
    return () => document.removeEventListener('visibilitychange', flush)
  }, [pathname, searchParams])

  return <>{children}</>
}
```

Detalhes que costumam ser descobertos tarde:

- **`visibilitychange`, não `beforeunload`.** Safari em iOS não dispara `beforeunload` de forma confiável; `visibilitychange` para `hidden` cobre fechar aba, trocar de app e bloquear a tela.
- **`useSearchParams` obriga `<Suspense>`.** Envolva o provider, ou o Next força a rota inteira para renderização dinâmica.
- **Após o login**, chame `POST /_a/identify` com o `Authorization` — é o gatilho do stitching (§3.7). Após o **logout**, chame `POST /_a/session` para rotacionar a sessão.

---

## 8. Plano de execução

| Fase | Entrega | Risco |
|---|---|---|
| **1. Segredo** | Remover `.default` do `COOKIE_SECRET`; provisionar em todos os ambientes | Baixo — deploy falha ruidosamente se faltar, que é o comportamento desejado |
| **2. Proxy** | `rewrites` no Next + `ANALYTICS_PROXY_SECRET` na API | Médio — valide o `Set-Cookie` atravessando o rewrite em Chrome **e** Safari antes de seguir |
| **3. Schema** | Migração: `AnalyticsVisitor`, colunas novas, backfill de `analytics_sessions` → visitantes | Médio — backfill em lotes; dados históricos ficam com `firstSeenAt` aproximado |
| **4. Backend** | Plugin encapsulado, `/session`, `/identify`, schemas com teto, rate limits | Baixo |
| **5. Frontend** | `AnalyticsProvider`, banner de consentimento, hooks de login/logout | Baixo |
| **6. Conformidade** | Job de retenção, `deleteVisitorData`, truncamento de IP | Baixo |

Ordem importa: **a fase 1 vai para produção sozinha e imediatamente.** É uma linha, não depende de nada e fecha a única falha com potencial de virar crítica.

### Testes que precisam existir

- **`__Host-`**: cookie emitido sem `Domain`, com `Path=/` e `Secure`.
- **Rejeição de assinatura**: cookie adulterado → `visitorId === null` → evento descartado com `204` e **zero linhas** no banco.
- **Sessão deslizante**: evento em T+29min renova; em T+31min cria sessão nova e incrementa `sessionCount`.
- **Escopo do hook**: `GET /health` responde **sem** `Set-Cookie` — é a asserção que fixa o item 4, e ela contradiz o teste atual em `analytics.e2e.spec.ts:55` (`'automatically sets visitor_id and session_id cookies on any request'`), que precisa ser reescrito junto.
- **Sem consentimento**: `POST /session` retorna `204` sem `Set-Cookie`.
- **`userId` não vem do body**: `POST /identify` com `{ userId: '<outro-usuário>' }` no corpo ignora o campo e usa o JWT.
- **Rotação de segredo**: cookie assinado com `COOKIE_SECRET_PREVIOUS` continua válido.
