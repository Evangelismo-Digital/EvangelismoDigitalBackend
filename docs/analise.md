Parece que o mesmo documento e pergunta foram enviados várias vezes seguidas — vou responder à pergunta uma única vez.

## Os timeouts fazem sentido?

Em geral sim, mas há um problema real de matemática no orçamento.

**O bug do budget:** o L3 tem timeout de 15s, mas ele *engloba* o L1 (10s) + KNN (~50ms) + Stadia (3s). O pior caso só dentro do L1 já é maior que 15s:

```
Address chain: 4.2s + 4.2s + 5.4s = 13.8s (se as 3 falharem em RETRYABLE)
Geocoding chain: 5.4s + 6.6s = 12s (se ambos falharem em RETRYABLE)
Total dentro do L1: 13.8s + 12s = 25.8s
```

Isso já estoura os 10s do próprio L1 — então na prática o `AbortSignal.any([timeout(10s), parentSignal])` aborta bem antes da cadeia completa rodar. Ou seja, o número "25.8s" no pior caso teórico nunca é alcançado porque o L1 corta em 10s. Mas isso significa que **o pior caso real do L1 é sempre exatamente 10s** (timeout estourando), não um valor menor baseado nas chains.

**Pior cenário de ponta a ponta, na prática:**
```
L1 timeout:        10s  (trunca a cadeia de address+geocoding)
KNN:              ~0.05s
Stadia:              3s
─────────────────────────
Total:           ~13s
```
Isso cabe dentro dos 15s do L3, com ~2s de folga — então o sistema não é obviamente quebrado, mas a folga é apertada e não sobra margem para latência de rede/Redis/overhead de serialização.

**Pontos que valeria revisar:**
1. Os números "worst case" da seção 8.1 (4.2s, 5.4s, 6.6s somados) descrevem uma cadeia que nunca termina de rodar, porque o L1 corta antes. Ou é um erro de documentação, ou o timeout do L1 deveria ser maior para essas chains realmente terminarem com fallback completo até o Nominatim.
2. Com apenas ~2s de margem entre o "pior caso realista" (13s) e o timeout do L3 (15s), qualquer lentidão adicional de Redis, latência de rede até o Postgres, ou GC pause pode estourar o L3 e cancelar tudo — mesmo que o L1 já tivesse conseguido achar a coordenada.
3. Vale decidir: o L1 timeout de 10s é para *nunca* deixar terminar o fallback completo de geocoding (aceitando que em cenário ruim cai em erro/timeout mais cedo), ou é um número desalinhado que deveria ser maior.

## Por que duas camadas de cache?

Elas não guardam a mesma coisa nem servem ao mesmo propósito — não é redundância, é separação de responsabilidades por **custo e volatilidade** de cada etapa:

- **L1 (CEP → coords):** protege a etapa mais lenta e mais sujeita a falha (3 providers de endereço + 2 de geocoding, várias chamadas HTTP externas). Mas, como você notou, o cache *positivo* dela é deletado na hora — só o negativo persiste. Então na prática o L1 hoje só serve para: (a) evitar reconsultar provedores externos quando o CEP é inválido (cache negativo, 30 min), e (b) deduplicar requisições concorrentes pro mesmo CEP enquanto ele está "quente" no Map em memória.

- **L3 (CEP → 5 igrejas):** é o cache que realmente importa para performance — guarda o resultado final completo, e é ele quem evita refazer o pipeline inteiro (geocoding + KNN + Stadia) em requisições repetidas.

**Então por que manter a estrutura do L1 se o positivo é apagado?** Pelo motivo que o documento já diz: se o L1 cacheasse sucesso e o L3 expirasse antes, o sistema teria coordenadas guardadas mas não as igrejas — ainda precisaria rodar KNN + Stadia de novo. Isso não economiza nada relevante (KNN é ~50ms, e Stadia é 1 chamada), então não compensa o custo de memória extra guardar coordenadas por 7 dias separadamente.

**Dito isso, você tem um ponto legítimo:** dado que o L1 positivo é sempre deletado, a única coisa que ele hoje realmente guarda de forma persistente é o cache **negativo** (CEP inválido, 30 min) — e isso poderia, em tese, ser cacheado diretamente no L3 também (já que erro de "CEP inválido" também vira erro final do L3). Nesse caso, o L1 poderia existir só como uma camada de dedup/circuit-breaker em memória, sem precisar de um prefixo Redis próprio com TTL — a menos que haja outro consumidor do `CepToLatLonUseCase` fora desse fluxo (outra feature que só precisa de coords, não de igrejas), o que justificaria cachear erros de CEP independentemente do L3. Isso não está claro na documentação — vale confirmar se `CepToLatLonUseCase` é reusado em outro lugar do sistema, porque essa é a única razão que justificaria de fato manter o L1 como cache Redis separado.