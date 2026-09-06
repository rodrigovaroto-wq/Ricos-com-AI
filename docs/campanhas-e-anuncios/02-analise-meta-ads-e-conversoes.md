# Análise — repositórios do lado "campanha" (Meta Ads / Conversions API)

> **Status: PESQUISA.** Nada foi implementado. Nenhum arquivo de aplicação foi
> criado. Nenhuma arquitetura foi escolhida.
> Data: 2026-09-05.

## Por que este arquivo existe

Os 8 repositórios de [`02-analise-dos-8-repositorios.md`](../agente-ia/03-pesquisa/02-analise-dos-8-repositorios.md)
resolvem **a conversa** (transporte de WhatsApp, agente, memória, CRM). Nenhum deles resolve
a lacuna nº 7 de [`../documentacao/decisoes/01-lacunas.md`](../documentacao/decisoes/01-lacunas.md):

> "**Conversões de volta para o Meta** → sem isso a campanha otimiza para conversa iniciada
> → **nenhuma referência resolve**."

Este arquivo audita especificamente o lado "campanha/anúncio" — repositórios oficiais e
de terceiros que lidam com Meta Ads, Conversions API e atribuição de Click-to-WhatsApp
(CTWA) — para ver se algum resolve essa lacuna. Mesmo método dos 8 anteriores: clone raso
(`git clone --depth 1`), leitura em disco, citação por arquivo e linha.

### Marcação de confiança (igual ao resto de `03-pesquisa/`)

`[FATO — CÓDIGO]` lido no arquivo · `[FATO — DOC]` documentação oficial, não confirmado no
código · `[INFERÊNCIA]` conclusão derivada · `[HIPÓTESE]` precisa validação ·
`NÃO IDENTIFICADO` sem evidência suficiente.

---

## 1. facebook/facebook-nodejs-business-sdk — resolve a lacuna 7

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/facebook/facebook-nodejs-business-sdk | |
| Último commit | 2026-08-25 (`Auto-generated nodejs SDK code update`) | FATO — CÓDIGO (`git log -1`) |
| Versão | `26.0.1` — acompanha a Marketing API v26 | FATO — CÓDIGO (`package.json`) |
| Licença | `"Platform License"` — licença própria da Meta (não OSI), ver `LICENSE`: uso,
cópia, modificação e distribuição permitidos "for use in connection with… Facebook,
Instagram, WhatsApp" | FATO — CÓDIGO |
| Linguagem | JavaScript (Flow), com `.d.ts` gerado | FATO — CÓDIGO |

### O que resolve, com arquivo e linha

| Peça | Evidência | Como funciona |
|---|---|---|
| Captura do `ctwa_clid` no evento | `src/objects/serverside/user-data.js` :56 (campo), :83–84 (doc), :137 (construtor), :1168–1185 (`get/set/setCtwaClid`), :1324–1326 (`normalize()`: `userData['ctwa_clid'] = this.ctwa_clid` — **vai cru, não é hasheado**, ao contrário de email/telefone/nome no mesmo arquivo) | O SDK já modela o campo exato que `lib/waha/atribuicao-de-anuncio.ts` do DeskcommCRM extrai do payload WAHA (`ctwaClid`) — falta só ligar um no outro. |
| `action_source` do evento | `src/objects/serverside/server-event.js` :211–223 (`get/set action_source`), :633–635 (entra no payload normalizado) | Campo obrigatório da Conversions API. Valor exigido pela doc oficial (ver abaixo): `"business_messaging"`. |
| `messaging_channel` do evento | `server-event.js` :462–485 (`get/set/setMessagingChannel`), :674–676 (payload) | Valor exigido: `"whatsapp"`. |
| Atribuição de campanha/anúncio no evento de conversão | `src/objects/serverside/attribution-data.js` (classe inteira, 699 linhas) — campos `ad_id`, `adset_id`, `campaign_id` :21–23, `attribution_share` :24, `attribution_model` :25, `touchpoint_type`/`touchpoint_ts` :29–30, `normalize()` :612–697 | Além de "aconteceu uma venda", dá para mandar de volta **qual anúncio/adset/campanha** gerou o lead — relevante para otimizar por criativo, não só por conta. |
| Casamento com o evento original ("conversa iniciada") | `src/objects/serverside/original-event-data.js` (classe inteira, 155 linhas) — `event_name`, `event_time`, `order_id`, `event_id`, `normalize()` :132–153 | Serve para o "attribution passback event": informar que o evento de venda se refere ao mesmo lead que já gerou um evento de conversa no Meta. |

### O que a doc oficial confirma (fora do código, mas fonte primária Meta)

`[FATO — DOC]` `developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging`
("Conversions API for Business Messaging: Onboarding Guide") confirma os dois valores que o
JSDoc do SDK (desatualizado nesse ponto — ainda lista o enum antigo `{physical_store, app,
chat, email, other, phone_call, system_generated, website}`) não documenta:

- `action_source: "business_messaging"`
- `messaging_channel: "whatsapp"`
- `ctwa_clid` vai dentro de `user_data`, obtido do objeto `referral` do webhook de mensagens
  — mesmo objeto que `contextInfo.externalAdReplyInfo` carrega no payload do Baileys/WAHA.

### Como isso fecha a lacuna 7

Rota concreta, sem escrever um cliente HTTP do zero: instalar
`facebook-nodejs-business-sdk`, construir um `ServerEvent` com
`.setActionSource('business_messaging').setMessagingChannel('whatsapp')`, um `UserData` com
`.setCtwaClid(ctwaClid)` (o mesmo valor que `lib/waha/atribuicao-de-anuncio.ts` do
DeskcommCRM já extrai), e mandar via `EventRequest`. **Continua sendo trabalho futuro** —
nada disso foi instalado ou escrito no projeto.

---

## 2. pipeboard-co/meta-ads-mcp — não resolve a lacuna 7; serve outra pergunta

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/pipeboard-co/meta-ads-mcp | |
| Último commit | 2026-08-10 | FATO — CÓDIGO |
| Linguagem | Python (`pyproject.toml`) | FATO — CÓDIGO |
| Modelo | Servidor MCP hospedado; o repositório é a parte aberta de um produto comercial
(Pipeboard), "badged Meta Business Partner" | FATO — DOC (README) |

`meta_ads_mcp/core/` tem: `accounts.py, ads.py, ads_library.py, adsets.py, api.py, auth.py,
budget_schedules.py, callback_server.py, campaigns.py, duplication.py, insights.py,
openai_deep_research.py, reports.py, resources.py, server.py, targeting.py, utils.py`
`[FATO — CÓDIGO]`. **Não há módulo de conversions/events.** `grep -rli "ctwa\|conversion"`
só acerta `adsets.py`, `campaigns.py`, `targeting.py`, `ads.py`, `insights.py` — são nomes de
campo de segmentação/otimização de campanha (ex.: otimizar por "conversas iniciadas"), não
envio de evento de conversão `[FATO — CÓDIGO]`.

`[INFERÊNCIA]` Este repositório responde a pergunta **original** da sessão — como o
operador usa o Claude Code para gerenciar a conta de anúncio da Encorpa por linguagem
natural (criar/pausar campanha, ajustar orçamento, ler insights de performance) — e não à
lacuna do agente de vendas. É uma ferramenta de operação da campanha, não uma peça a
copiar para dentro do produto: usar em produção significa depender do serviço Pipeboard
(conta/token próprios), não vendorizar código.

---

## 3. WhatsApp/WhatsApp-Nodejs-SDK — descartado por obsolescência, apesar de "oficial"

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/WhatsApp/WhatsApp-Nodejs-SDK | |
| Último commit | **2023-06-07** | FATO — CÓDIGO |

`src/types/webhooks.ts` :136–141 define `ReferralObject` com `source_url`, `source_type`
(`ReferralSourceTypesEnum`), `source_id`, `headline`, `body` `[FATO — CÓDIGO]`.
`grep -rn "clid" src/` não retorna nenhuma ocorrência em todo o SDK `[FATO — CÓDIGO]` — o
campo `ctwa_clid` simplesmente não existe nessa versão, porque o SDK parou de ser mantido
antes do recurso existir.

`[INFERÊNCIA]` Mesmo critério já aplicado à Evolution API em
`02-analise-dos-8-repositorios.md` (§1.3, "ressalva de atualidade"): **"oficial" não supre
"abandonado"** quando a peça precisa acompanhar mudança de protocolo/API. Descartado como
referência para esta lacuna.

---

## Tabela de licenças (complementa a de [`01-selecao-das-referencias.md`](../agente-ia/03-pesquisa/01-selecao-das-referencias.md) / [`README.md`](README.md))

| Repo | Licença | Restrição |
|---|---|---|
| facebook-nodejs-business-sdk | "Platform License" (própria da Meta, não OSI) | uso permitido em conexão com produtos Meta (Facebook/Instagram/WhatsApp) — ler o `LICENSE` completo antes de redistribuir |
| pipeboard-co/meta-ads-mcp | NÃO IDENTIFICADO (não li o arquivo `LICENSE` nesta passagem) | é a parte aberta de um produto comercial hospedado — tratar como tal |
| WhatsApp/WhatsApp-Nodejs-SDK | NÃO IDENTIFICADO | descartado por obsolescência antes de checar licença |

## Conclusão desta rodada

Das três referências, só uma muda o estado de uma lacuna: **facebook-nodejs-business-sdk
resolve a lacuna 7** com uma rota concreta e código pronto para reaproveitar (instalar +
configurar, não copiar arquivo por arquivo, dado o Platform License). As outras duas
respondem perguntas diferentes: pipeboard-co/meta-ads-mcp é sobre operar a conta de anúncio
por IA (fora do escopo do agente de vendas), e o SDK oficial do WhatsApp Cloud API está
obsoleto demais para ser referência de atribuição.
