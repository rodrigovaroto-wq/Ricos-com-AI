# Análise consolidada — 8 referências para o agente de vendas no WhatsApp

> **Status: PESQUISA.** Nada foi implementado. Nenhum arquivo do nosso projeto foi
> alterado. Nenhuma arquitetura foi escolhida.
> Data: 2026-09-04.
>
> **Nota de 2026-09-05:** as citações a `docs/PROMPT.md` abaixo são registro histórico
> — o arquivo existia quando esta varredura foi feita e foi removido depois, por
> especificar prospecção ativa no Instagram (canal incompatível com esta operação).
> O achado desta seção ("a spec que temos é do canal errado") continua correto; o
> que era transversal nela está preservado em
> [`../../campanhas-e-anuncios/01-campanha-e-canais.md`](../../campanhas-e-anuncios/01-campanha-e-canais.md)
> e em [`../../documentacao/03-padroes-de-engenharia.md`](../../documentacao/03-padroes-de-engenharia.md).

## Método e como auditar

Os 8 repositórios foram **clonados** (`git clone --depth 1`) e lidos em disco. Toda
afirmação abaixo aponta arquivo e, quando aplicável, linha. Para conferir:
`https://github.com/<repo>/blob/<branch>/<caminho>#L<linha>`.

A API do GitHub está bloqueada nesta sessão (o proxy responde 403 para
`api.github.com` e para `github.com` via curl). Datas de commit vêm de `git log -1`
no clone (FATO — CÓDIGO). Contagens de commits e estrelas vêm da página pública lida
via fetch (FATO — DOCUMENTAÇÃO).

### Marcação de confiança usada em todo o documento

- `[FATO — CÓDIGO]` — li o arquivo.
- `[FATO — DOC]` — está na documentação do projeto; **não** confirmei no código.
- `[INFERÊNCIA]` — conclusão derivada de evidência observada.
- `[HIPÓTESE]` — precisa de validação.
- `NÃO IDENTIFICADO` — não achei evidência suficiente.

### Aviso sobre profundidade desigual

DeskcommCRM foi lido com muito mais profundidade que os demais, porque é o único
cujo domínio é o mesmo do nosso. Em Mastra, n8n e Chatwoot — monorepos de 250 a
350 MB — li os diretórios relevantes ao nosso caso, não o repositório inteiro.
Onde não olhei, está escrito `NÃO IDENTIFICADO`, e isso significa "não verifiquei",
não "não existe".

---

# 1. Fichas técnicas dos 8 repositórios

## 1.1 DeskcommCRM

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/melgarafael/DeskcommCRM | |
| Último commit | 2026-09-04T01:20:17-03:00 (`Merge PR #557 — fix(kit)`) | FATO — CÓDIGO (`git log -1`) |
| Commits (aprox.) | 3.505 na `main` | FATO — DOC (página) |
| Estrelas / forks | 798 / 355 | FATO — DOC |
| Linguagem | TypeScript | FATO — CÓDIGO |
| Framework | Next.js 16.3 (App Router) + React 19.2 (`package.json`) | FATO — CÓDIGO |
| Banco | Supabase Postgres + pgvector; 190 arquivos em `supabase/migrations/` | FATO — CÓDIGO |
| IA | Vercel AI SDK v7 (`"ai": "^7.0.79"`), provedores Anthropic/OpenAI/Google/OpenRouter | FATO — CÓDIGO |
| WhatsApp | WAHA (engine NOWEB) em `lib/waha/`; canal oficial Meta em `lib/channels/meta/` | FATO — CÓDIGO |
| Orquestração | `event_log` + workers drenados por 10 endpoints em `app/api/v1/cron/` | FATO — DOC (ARCHITECTURE.md) + FATO — CÓDIGO (`lib/agent-engine/queue/`) |
| Integrações | Supabase, WAHA, Upstash Redis, Vercel AI Gateway, Nuvemshop, Sentry, Resend, MCP | FATO — DOC (ARCHITECTURE.md, tabela "Integrações externas") |
| Licença | MIT (`LICENSE`) | FATO — CÓDIGO |

### Características

| # | Característica | Status | Evidência (arquivo → símbolo → linhas) | Como funciona |
|---|---|---|---|---|
| 1 | Arquitetura do sistema | EXISTE | `ARCHITECTURE.md` §Camadas, §"Fluxo de uma requisição" | App Next.js (UI + route handlers) sobre Supabase; canal WhatsApp por adapter; motor do agente separado em `lib/agent-engine/`. Fluxo do turno documentado: `inbound → HMAC + idempotência → event_log → worker → runAgentTurn → guardrails before-send → adapter → handoff`. |
| 2 | Estrutura de pastas | EXISTE | `lib/agent-engine/{agent,guardrails,queue,edge,pacing,playbooks,flywheel}`, `lib/waha/`, `lib/mcp/`, `workers/`, `app/api/v1/` (230 `route.ts`) | Motor do agente isolado do app; `edge/` concentra as bordas (canal, CRM, LLM). |
| 3 | Agente / loop autônomo | EXISTE | `lib/agent-engine/agent/inbound-turn.ts` (3.391 linhas); `DEFAULT_MAX_SENDS_PER_TURN` :322 | Turno multi-step com teto de passos e teto de envios por turno; o texto só sai por tool. |
| 4 | Tools / function calling | EXISTE | `inbound-turn.ts` → `AGENT_TOOL_DEFS` :148–308 | 12 tools declaradas com Zod: `get_lead_context`, `send_message`, `update_lead_state`, `schedule_followup`, `save_lead_note`, `get_lead_note`, `search_knowledge`, `request_human_handoff`, `read_skill_reference`, `open_human_case`, `provide_case_update`, `send_template`. Schema largo para o SDK, validação estrita depois — campo forjado vira erro de ensino ao modelo, não exceção. |
| 5 | Memória | EXISTE | `agent/lead-notes.ts`, `lead-notes-recall.ts`, `org-memory.ts`; tool `save_lead_note` (`inbound-turn.ts` :193+) | Notas duráveis por lead com headline no índice e corpo sob demanda; consolidação por `supersedes` (nota nova apaga as antigas listadas). |
| 6 | RAG / base de conhecimento | EXISTE | `agent/search-knowledge.ts` → `searchKnowledge` :42, `citationsFromHits` :173; ingestão em `lib/ai/rag/ingest/{faq,documento,conversations}.ts`; `lib/ai/rag/chunker.ts` | Busca na base da org e devolve hits com citação; ingestão separada por tipo de fonte, com debounce (`lib/ai/rag/debounce.ts`). |
| 7 | Estado da conversa | EXISTE | `agent/lead-state.ts` → `LEAD_STAGES` :23, `LEAD_STAGE_TRANSITIONS` :35, `isValidTransition` :45 | Máquina de estados do funil (`new → contacted → qualifying → qualified → negotiating → won\|lost`) com transições declaradas; **regressão é rejeitada**. |
| 8 | Gerenciamento de contexto | EXISTE | `agent/compaction.ts` → `trimTranscriptToBudget` :113, `maybeCompact` :190, `COMPACTION_INSTRUCTION` :60 | Corta a transcrição por orçamento de tokens e, ao estourar, compacta em resumo estruturado. |
| 9 | Múltiplas mensagens | EXISTE | `agent/split-message.ts` → `splitIntoBubbles` :7, `sendInBubbles` :99 | Resposta longa vira várias bolhas com envio sequencial — comportamento humano no WhatsApp. |
| 10 | Filas / concorrência | EXISTE | `lib/agent-engine/queue/queue.ts` → `enqueueJob` :69, `claimJobs` :206, `completeJob` :242; `queue/loop.ts` → `rodarLoopDaFila` :63 | Fila em tabela Postgres com claim; loop de worker com intervalos. Serialização por número via `pg_advisory_xact_lock(hashtext(channel_session_id))` (`guardrails/before-send.ts` :28–36, comentário de cabeçalho). |
| 11 | Retries | EXISTE | `agent/tool-breaker.ts` → `wrapToolsWithBreaker` :110, `READ_ONLY_TOOLS` :60, `canonicalHash` :92 | Circuit breaker por tool: hash canônico do argumento detecta repetição e corta o laço; tools read-only têm limiar diferente. |
| 12 | Idempotência | EXISTE | `ARCHITECTURE.md` §"Event log + workers": `unique (organization_id, external_id)` + captura de `code === '23505'`; ocorrência em `lib/ai/dispatcher/index.ts` :314 e `lib/ai/runtime/agent.ts` :236 | Chave única no banco + tratamento explícito da violação como "já processado". |
| 13 | Tratamento de erros | EXISTE | `lib/mcp/recusa-para-o-modelo.ts`; `guardrails/before-send.ts` → `BeforeSendResult` :702–715 | Erro volta ao modelo como texto instrutivo em pt-br ("o quê foi vetado + o que fazer"), não como stack trace. |
| 14 | Logs / auditoria | EXISTE | `guardrails/before-send.ts` → `GateTraceEntry` :694–701 e tabela `before_send_traces`; `lib/audit/`; `lib/mcp/audit.ts` | Um registro por gate avaliado, com veredito e código, persistido e exportável por run. |
| 15 | CRM | EXISTE | `lib/mcp/tools/{leads,contacts,conversations,pipelines}.ts`; `app/api/v1/{leads,contacts,pipelines}` | CRM completo exposto ao agente como tools MCP. |
| 16 | Catálogo | EXISTE | `lib/mcp/tools/comercio.ts` → `crm_search_products` :137; `lib/catalogo/{busca,planilha}.ts`; `app/api/v1/products` | Busca de produto disponível como tool do agente. |
| 17 | Carrinho | NÃO IDENTIFICADO | — | Não localizei modelo de carrinho; o fluxo observado vai de produto a pedido. |
| 18 | Recomendação de produto | PARCIAL | `crm_search_products` (`comercio.ts` :137) | Existe busca; **não** localizei lógica de ranking/recomendação. [INFERÊNCIA] a recomendação é do LLM sobre o resultado da busca. |
| 19 | Qualificação de lead | EXISTE | tool `update_lead_state` (`inbound-turn.ts` :162–176) com `qualification: budget/authority/need/timeline`; `agent/stage-classifier.ts` → `classifyStage` :92 | BANT explícito no schema da tool + classificador auxiliar de estágio que sugere avanço e registra divergência (`recordStageDivergenceCandidate` :150). |
| 20 | Tratamento de objeções | NÃO IDENTIFICADO como componente | `lib/agent-engine/playbooks/`, `agent/playbook.ts`, `playbook-seed.ts` | Existem playbooks configuráveis; não li conteúdo de objeção específico. [HIPÓTESE] objeção é conteúdo de playbook/prompt, não código. |
| 21 | Checkout | NÃO EXISTE | — | Nenhum checkout próprio; comércio entra por Nuvemshop (`lib/nuvemshop/api-client.ts`). |
| 22 | Pagamento | NÃO EXISTE | — | Nenhum provedor de pagamento no `package.json` nem em `lib/`. |
| 23 | Criação de pedido | NÃO IDENTIFICADO | `lib/mcp/tools/comercio.ts` → `crm_list_contact_orders` :27 (leitura) | O agente **lê** pedidos do contato; não localizei tool de criação de pedido. |
| 24 | Acompanhamento de pedido | PARCIAL | `crm_list_contact_orders` :27 | O agente consulta os pedidos do contato para responder; não localizei rastreamento logístico. |
| 25 | Recuperação de lead abandonado | EXISTE | `lib/followup/agent-followup-gate.ts` (gatilhos `silence` / `stage_change` / `conversation_end`); `agent/reentry-knobs.ts`, `reentry-template.ts` | Varredura de silêncio cria enrollment de follow-up se um agente publicado habilitou aquele pointer. |
| 26 | Follow-up automático | EXISTE | tool `schedule_followup` (`inbound-turn.ts` :177–192); `agent/schedule-followup.ts` → `applyScheduleFollowup` :77; `agent/followup-turn.ts`; `followup-flow-classify.ts` | O agente agenda o próprio retorno ao prometer voltar; o sistema executa no horário. Uma tool, uma promessa. |
| 27 | Pós-venda | NÃO IDENTIFICADO | — | Não localizei fluxo dedicado de pós-entrega. |
| 28 | Handoff humano | EXISTE | `agent/human-handoff.ts` → `detectHumanHandoffRequest` :61, `performHumanHandoff` :117, `applyRequestHumanHandoff` :252, `buildHandoffSummary` :310; `lib/ai/runtime/handoff.ts` :1–13 | Duas fontes: sentinela por regex no inbound (custo zero, sem LLM) e tool chamada pelo agente. Handoff gera resumo para o humano. |
| 29 | Segurança | EXISTE | `lib/waha/ingest.ts` :256 (HMAC-SHA512 + `timingSafeEqual`); `lib/agent-engine/edge/egress.ts` → `allowlistedFetch` :80; `guardrails/jailbreak/`; `docs/threat-model.md` | Webhook assinado, egress por allowlist de host, detector de jailbreak no inbound (advisório). O `threat-model.md` documenta as lacunas em vez de escondê-las. |
| 30 | Escalabilidade | PARCIAL | `queue/queue.ts` (claim em Postgres), advisory lock por número, `lib/ai/dispatcher/rate-limit.ts` (janela fixa Upstash, com fallback em memória) | Escala por workers concorrentes com lock por número. `ARCHITECTURE.md` registra que o rate limit está aplicado em apenas 2 pontos. |
| 31 | Anti-banimento / pacing | EXISTE | `lib/agent-engine/pacing/engine.ts` → `decidePacing` :56, `warmupCapFor` :120, `janelaDeEnvioAberta` :201; gate `pacingGate` em `BEFORE_SEND_GATES` :684 | Janela de horário, throttle, aquecimento progressivo de número novo e teto diário, avaliados antes de cada envio. |
| 32 | Guardrails de conteúdo | EXISTE | `guardrails/before-send.ts` → `BEFORE_SEND_CHAIN_VERSION = 7` :660, `BEFORE_SEND_GATES` :681–693 | 11 portões em ordem fixa e versionada: `stop → lgpd → pacing → messagingWindow → spinning → promise → semanticPromise → casePromise → internalVocabulary → agendaStall → disclosure`. Ordem é constante de código, e um teste trava ordem/tamanho/versão. |
| 33 | Atribuição de anúncio (Meta Ads → WhatsApp) | EXISTE | `lib/waha/atribuicao-de-anuncio.ts` → `extrairAtribuicaoWaha` :23–56; `lib/channels/atribuicao-de-anuncio-oficial.ts`; `lib/leads/atribuicao-de-anuncio.ts` → `estamparAtribuicaoDoContato` :56 | Lê `contextInfo.externalAdReplyInfo` do Baileys (via payload WAHA), extrai `ctwaClid`/`sourceId`/`title`/`sourceUrl`, e **descarta post orgânico compartilhado** checando `sourceType !== 'ad'` (:41–42) antes de carimbar `meta_ads` no contato. |
| 34 | Classificação de intenção | EXISTE | `agent/intent-classifier.ts` → `buildClassifierPrompt` :30, `parseIntentVerdict` :57, `classifyIntent` :90 | Classificador barato roteia para o membro certo antes do turno caro. |
| 35 | Multi-tenancy | EXISTE | `ARCHITECTURE.md` §Multi-tenancy; `organization_id` em toda tabela; RLS via `fn_user_org_ids()` | Isolamento por RLS; handlers com service role filtram org manualmente. |
| 36 | LGPD / privacidade | EXISTE | `lib/ai/anonymize/`, `lib/lgpd/`, gate `lgpdGate` :683, workers `lgpd-export` / `lgpd-redact` | Anonimização irreversível veta qualquer envio ao contato. |
| 37 | Testes | EXISTE | testes ao lado do código (`*.test.ts`), `.github/workflows/{ci,e2e,perf}.yml` | CI com unit, e2e Playwright e perf. |
| 38 | Observabilidade | EXISTE | `lib/agent-engine/obs/`, Sentry com `beforeSend` que higieniza PII (`ARCHITECTURE.md`) | |
| 39 | Custo de IA | EXISTE | `lib/ai/runtime/cost.ts`, `lib/ai/usage/aggregate.ts`, `RESUMO_DO_HANDOFF_POR_ORCAMENTO` (`inbound-turn.ts` :432) | Teto de gasto por conversa; ao estourar, **vira handoff humano** em vez de continuar gastando. |
| 40 | Maturidade declarada | PARCIAL | `package.json` → `"version": "0.1.0"`; `docs/current-state.md` (retrato datado, auto-relatado) | O próprio projeto avisa que o retrato de estado não é mantido e que auditoria de 2026-08-14 achou 40 afirmações desatualizadas. |

**Limitações observadas.** Mono-mantenedor (`git log` do clone raso mostra um único autor;
355 forks para 798 estrelas sugere funil de tutorial, não contribuição — [INFERÊNCIA]).
Acoplamento a Supabase, Upstash, Sentry e Vercel AI Gateway. Instalação principal por kit
com link de afiliado de hospedagem (`README.md` §"Rode este CRM em produção com 1 comando").


---

## 1.2 WAHA (devlikeapro/waha)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/devlikeapro/waha (branch padrão `core`) | |
| Último commit | 2026-09-01T15:36:04+07:00 (`fix(ChatWoot): duplicate contact created for same LID`) | FATO — CÓDIGO |
| Commits (aprox.) | 2.365 na `core` | FATO — DOC |
| Estrelas | 7,3k | FATO — DOC |
| Linguagem | TypeScript | FATO — CÓDIGO |
| Framework | NestJS 11 (`@nestjs/core`, `nest-cli.json`) | FATO — CÓDIGO |
| Banco | MongoDB 6.9 (dependência) + Redis/ioredis para filas; sem ORM relacional | FATO — CÓDIGO (`package.json`) |
| IA | **NÃO EXISTE** — `package.json` não tem nenhum SDK de LLM (grep por `openai`, `@anthropic-ai/*`, `langchain`: vazio) | FATO — CÓDIGO |
| WhatsApp | 4 engines em `src/core/engines/`: `webjs` (Puppeteer + fork próprio de whatsapp-web.js), `noweb` (WebSocket estilo Baileys), `gows` (Go), `wpp` | FATO — CÓDIGO |
| Orquestração | BullMQ (`src/apps/app_sdk/BullUtils.ts`, `AppConsumer.ts`) | FATO — CÓDIGO |
| Integrações | Chatwoot (`src/apps/chatwoot/`), MCP (`src/apps/mcp/`), S3/MinIO, números BR (`src/apps/brazilian-phone-numbers/`) | FATO — CÓDIGO |
| Licença | **Apache-2.0 no arquivo `LICENSE`**, porém `package.json` declara `"license": "UNLICENSED"` — divergência real, vale checar antes de qualquer uso comercial | FATO — CÓDIGO |

### Características (só o que EXISTE; o restante está agrupado abaixo)

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 1 | Arquitetura | EXISTE | `src/core/engines/*`, `src/api/*.controller.ts`, `src/modules/waha-webhook/` | API REST NestJS que abstrai 4 engines de WhatsApp atrás dos mesmos endpoints; eventos saem por webhook e WebSocket. |
| 2 | Estrutura de pastas | EXISTE | `src/{api,core,modules,apps,structures,dashboard}` | `api/` = controllers HTTP, `core/engines/` = implementações por engine, `apps/` = integrações opcionais. |
| 9 | Múltiplas mensagens | PARCIAL | `src/api/chatting.controller.ts` → `sendSeen` :243, `startTyping` :259 | Expõe presença/digitando; **não** agrega mensagens do usuário — quem agrega é quem consome. |
| 10 | Filas / concorrência | EXISTE | `src/apps/app_sdk/BullUtils.ts`, `AppConsumer.ts`, `src/apps/chatwoot/services/ChatWootQueueService.ts` | BullMQ sobre Redis nas integrações (`apps`). |
| 11 | Retries | EXISTE | `src/modules/waha-webhook/WebhookPlugin.sender.ts` :9 (`axios-retry`), `buildRetryDelay` :182–204, backoff exponencial `2 ** retryNumber * delayFactor` :36, `onRetry` :136–141 | Política de retry de webhook configurável (constante ou exponencial), respeitando `Retry-After`. |
| 13 | Tratamento de erros | EXISTE | `src/apps/chatwoot/error/ChatWootErrorReporter.ts` | Reporter dedicado por app. |
| 14 | Logs | EXISTE | `src/apps/app_sdk/JobLoggerWrapper.ts`, `src/tracing.ts` | Log por job. |
| 29 | Segurança | EXISTE | `WebhookPlugin.sender.ts` → `calculateHmac` :171–177, header `X-Webhook-Hmac` :155; `src/structures/webhooks.config.dto.ts` → `HmacConfiguration` :63–70; `src/api/apikeys.controller.ts` | Webhook assinado por HMAC com chave por webhook; API key para a API. |
| 4 | Tools / function calling | EXISTE (como **servidor**) | `src/apps/mcp/mcp.server.ts` :24–25 (`registerTool`), `src/apps/mcp/tools/{send,auth,sessions,chats,contacts,channels,calls,api,apps}.tools.ts` | Expõe as operações de WhatsApp como tools MCP — um agente externo consegue enviar mensagem via MCP. Não consome tools. |
| 15 | CRM | PARCIAL (integração) | `src/apps/chatwoot/services/ChatWootAppService.ts` | Sincroniza conversas com Chatwoot; não é CRM próprio. |

### NÃO EXISTE em WAHA (verificado por ausência de dependência e de diretório)

Agente/loop autônomo · memória · RAG · estado de conversa de negócio · gerenciamento de
contexto de LLM · catálogo · carrinho · recomendação · qualificação · objeções · checkout ·
pagamento · pedido · acompanhamento de pedido · recuperação de lead · follow-up · pós-venda ·
handoff humano · atribuição de anúncio · pacing anti-ban.
[INFERÊNCIA] Nada disso é falha: WAHA é **transporte**. Tudo acima é responsabilidade de quem consome a API.

---

## 1.3 Evolution API (evolution-foundation/evolution-api)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/evolution-foundation/evolution-api | |
| Último commit | `main` 2026-05-06T14:38:27-03:00 · `develop` 2026-07-14T16:50:52-03:00 | FATO — CÓDIGO |
| Commits (aprox.) | 2.629 na `main` | FATO — DOC |
| Estrelas | 9,5k · 144 issues abertas | FATO — DOC |
| Linguagem / framework | TypeScript, Express | FATO — CÓDIGO |
| Banco | Postgres ou MySQL via Prisma (`prismaRepository`) | FATO — CÓDIGO |
| IA | `openai ^4.77.3` no `package.json` — usado pelo bot embutido | FATO — CÓDIGO |
| WhatsApp | `src/api/integrations/channel/whatsapp` (Baileys) e `channel/meta` (Cloud API oficial) | FATO — CÓDIGO |
| Orquestração | Eventos por `webhook`, `rabbitmq`, `sqs`, `kafka`, `nats`, `pusher`, `websocket` (`src/api/integrations/event/`) | FATO — CÓDIGO |
| Integrações | Typebot, Chatwoot, Dify, OpenAI, n8n, Flowise, EvoAI, S3 | FATO — CÓDIGO (diretórios em `src/api/integrations/chatbot/`) |
| Licença | Apache-2.0 (`package.json` `"license": "Apache-2.0"`, versão 2.3.7) | FATO — CÓDIGO |

### Características

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 1 | Arquitetura | EXISTE | `src/api/integrations/{channel,event,chatbot,storage}` | Três eixos: canal (como fala com o WhatsApp), evento (para onde manda), chatbot (quem responde). |
| 3 | Agente / loop | PARCIAL | `src/api/integrations/chatbot/openai/services/openai.service.ts` :316–385 | Usa **threads da API de Assistants da OpenAI** (`threadId = session.sessionId`); o laço é da OpenAI, não do Evolution. Não é um loop de tools próprio. |
| 4 | Tools / function calling | NÃO IDENTIFICADO | — | Não localizei definição de tools no `openai.service.ts`. |
| 5 | Memória | PARCIAL | `openai.service.ts` :316–385 (`threadId` persistido em `integrationSession.sessionId`) | A memória é a thread do provedor; não há memória própria consultável. |
| 7 | Estado da conversa | EXISTE | `src/api/integrations/chatbot/base-chatbot.service.ts` → `process()` :120–172 | Máquina de estados de sessão: `paused` → ignora (:136–138); `keywordFinish` → `closed` (:140–153); senão envia ao bot e marca `opened` + `awaitUser` (:159–170). |
| 9 | Múltiplas mensagens | EXISTE | `src/api/integrations/chatbot/base-chatbot.controller.ts` → `debounceTime` :23, :41, :108, :131; `dify/validate/dify.schema.ts` :42 | `debounceTime` agrupa mensagens picadas do usuário antes de acionar o bot; `delayMessage` (`base-chatbot.service.ts` :215, :223, :294) espaça o envio. |
| 10 | Filas | EXISTE | `src/api/integrations/event/{rabbitmq,kafka,sqs,nats}` | Publica eventos em brokers externos. |
| 11 | Retries | EXISTE | `src/api/integrations/event/rabbitmq/rabbitmq.controller.ts` :251–293 e :304–342 | Laço de 3 tentativas na publicação, com log por tentativa; reconexão com `maxReconnectAttempts` :146. |
| 12 | Idempotência | NÃO IDENTIFICADO | — | Não localizei chave de deduplicação de mensagem recebida. |
| 25 / 26 | Recuperação de lead / follow-up | NÃO EXISTE | — | Nenhum agendador; a única temporalidade é `expire` de sessão. |
| 28 | Handoff humano | PARCIAL | `base-chatbot.service.ts` :140–153 (`keywordFinish` fecha a sessão) e integração Chatwoot | Palavra-chave encerra o bot; quem assume é o Chatwoot, se estiver ligado. |
| 34 | Gatilho de entrada | EXISTE | `base-chatbot.controller.ts` → `triggerType` `all` :159–170, `keyword` :171–189, `advanced` :190–222 (e :638–712) | Define quando o bot entra na conversa: sempre, por palavra-chave, ou por expressão avançada. |
| 29 | Segurança | PARCIAL | `apikey` global por instância (padrão do projeto) | Não localizei HMAC de webhook de entrada. |

### NÃO EXISTE / NÃO IDENTIFICADO em Evolution
Catálogo · carrinho · recomendação · qualificação · objeções · checkout · pagamento · pedido ·
acompanhamento · pós-venda · RAG próprio · pacing anti-ban · atribuição de anúncio.
**Ressalva de atualidade [FATO — CÓDIGO]:** `main` sem commit há ~4 meses e `develop` há ~2,
enquanto WAHA commitou há 3 dias. Para uma peça que depende de acompanhar mudanças de
protocolo do WhatsApp, isso é risco, não detalhe.

---

## 1.4 Baileys (WhiskeySockets/Baileys)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/WhiskeySockets/Baileys | |
| Último commit | 2026-08-04T20:41:35+03:00 | FATO — CÓDIGO |
| Commits (aprox.) | 2.264 | FATO — DOC |
| Estrelas | 11k | FATO — DOC |
| Linguagem | TypeScript · `"version": "7.0.0-rc14"` | FATO — CÓDIGO |
| Framework | Nenhum — biblioteca. Deps centrais: `ws`, `libsignal`, `@hapi/boom` | FATO — CÓDIGO |
| Banco | **Nenhum** — sem driver de banco no `package.json` | FATO — CÓDIGO |
| IA / WhatsApp | Sem IA. É a implementação do protocolo WhatsApp Web multi-dispositivo por WebSocket, sem navegador | FATO — CÓDIGO (`src/Socket/socket.ts`) |
| Licença | MIT | FATO — CÓDIGO |

### Características

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 1 | Arquitetura | EXISTE | `src/{Socket,Utils,Types,Signal,WABinary,WAUSync,WAM}` | Camadas: socket → binário → criptografia Signal → eventos tipados. `src/Socket/{messages-send,messages-recv,chats,groups,business}.ts`. |
| 7 | Estado (sessão técnica) | EXISTE | `src/Utils/use-multi-file-auth-state.ts` → `useMultiFileAuthState` :33 | Persiste credenciais e chaves em arquivos; é o que evita reler o QR a cada restart. |
| 9 | Múltiplas mensagens | EXISTE (técnico) | `src/Utils/event-buffer.ts` → `makeEventBuffer` :73 | Bufferiza e consolida eventos do socket antes de emiti-los — evita processar meia atualização. |
| 11 | Retries | EXISTE | `src/Utils/message-retry-manager.ts` → `class MessageRetryManager` :65, `addRecentMessage` :114, `incrementRetryCount` :218; `src/Types/Socket.ts` → `retryRequestDelayMs` :67, `maxMsgRetryCount` :69; uso em `src/Socket/messages-recv.ts` :597, :1305, :1722 | Retry de descriptografia/reenvio no nível do protocolo, com teto de tentativas. |
| 33 | Atribuição de anúncio | EXISTE (como dado) | `contextInfo.externalAdReplyInfo` — consumido por terceiros, ver DeskcommCRM `lib/waha/atribuicao-de-anuncio.ts` :23–56 | Baileys entrega o campo bruto da mensagem; quem interpreta é a aplicação. |
| — | Aviso de ToS | EXISTE | `README.md` §aviso | Mantenedores declaram não endossar uso que viole os Termos do WhatsApp. |

### NÃO EXISTE em Baileys
Tudo que é aplicação: agente, tools, memória, RAG, CRM, catálogo, pedido, pagamento,
follow-up, handoff, pacing, auditoria de negócio, fila de trabalho.
[INFERÊNCIA] É o degrau mais baixo dos três transportes — máximo controle, máximo trabalho.

---

## 1.5 n8n (n8n-io/n8n)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/n8n-io/n8n | |
| Último commit | 2026-09-04T03:06:30Z | FATO — CÓDIGO |
| Commits (aprox.) | 23.826 | FATO — DOC |
| Estrelas | 203k | FATO — DOC |
| Linguagem / framework | TypeScript, monorepo pnpm + Turbo | FATO — CÓDIGO |
| Banco | SQLite (padrão), Postgres, MySQL — camada própria de persistência de execuções | FATO — DOC |
| IA | `packages/@n8n/nodes-langchain` — LangChain | FATO — CÓDIGO |
| WhatsApp | `packages/nodes-base/nodes/WhatsApp/` — **somente Cloud API oficial**: `GenericFunctions.ts` :19 `WHATSAPP_BASE_URL = 'https://graph.facebook.com/v13.0/'`, OAuth :36 | FATO — CÓDIGO |
| Licença | Sustainable Use License (`LICENSE.md`) — fair-code, não OSI | FATO — CÓDIGO |

### Características

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 3 | Agente / loop | EXISTE | `packages/@n8n/nodes-langchain/nodes/agents/Agent/V2/AgentV2.node.ts` :142 → `toolsAgentExecute`; versões V1/V2/V3 lado a lado | Nó de agente com laço de tools do LangChain; `AgentTool.node.ts` permite agente-como-tool (sub-agente). |
| 4 | Tools | EXISTE | `packages/@n8n/nodes-langchain/nodes/tools/{ToolHttpRequest,ToolCode,ToolWorkflow,ToolVectorStore,ToolThink,ToolCalculator,...}` | Cada nó vira uma tool do agente; `ToolWorkflow` transforma um workflow inteiro em tool. |
| 5 | Memória | EXISTE | `packages/@n8n/nodes-langchain/nodes/memory/{MemoryPostgresChat,MemoryRedisChat,MemoryBufferWindow,MemoryMongoDbChat,MemoryZep,MemoryXata,MemoryMotorhead,MemoryManager}` | Memória de chat plugável por `sessionId`; janela de buffer ou store externo. **É histórico de conversa, não memória de fatos.** |
| 6 | RAG | EXISTE | `nodes/tools/ToolVectorStore`, nós de vector store no mesmo pacote | Vector store como tool do agente. |
| 10 | Filas / concorrência | EXISTE | `packages/cli/src/scaling/{scaling.service.ts,job-processor.ts,redis/,multi-main-setup.ee.ts,redis-lock.service.ts}` | Modo fila com Redis, workers separados e eleição de líder para multi-main. |
| 11 | Retries | EXISTE | `packages/workflow/src/interfaces.ts` :1663–1665 → `retryOnFail`, `maxTries`, `waitBetweenTries` | Retry por nó, configurável no editor. |
| 13 | Tratamento de erros | EXISTE | `settings.errorWorkflow` (padrão do produto) + `continueOnFail` nos nós | Workflow de erro dedicado. |
| 14 | Logs / auditoria | EXISTE | histórico de execuções persistido (`packages/cli`) | Toda execução fica gravada com entrada e saída por nó. |
| 26 | Follow-up automático | EXISTE | nós `Schedule Trigger` e `Wait` (`packages/nodes-base/nodes/`) | Agendamento e espera são primitivas de primeira classe. |
| 8 | Contexto | PARCIAL | nós de memória + `MemoryManager` | Janela de mensagens; não localizei compactação/sumarização automática por orçamento. |
| 12 | Idempotência | NÃO IDENTIFICADO | — | Não localizei mecanismo nativo de deduplicação de execução. [HIPÓTESE] fica por conta do autor do workflow. |
| 15–27 | CRM, catálogo, carrinho, recomendação, qualificação, objeção, checkout, pagamento, pedido, acompanhamento, pós-venda | NÃO EXISTE como domínio | — | n8n integra sistemas que têm isso; não modela nada disso. |
| 28 | Handoff humano | PARCIAL | [FATO — DOC] README cita "human approval workflows"; não localizei o nó no código nesta leitura | Marcado PARCIAL por evidência documental apenas. |
| 31 | Pacing anti-ban | NÃO EXISTE | — | Como usa a Cloud API oficial, o problema é outro (janela de 24h e templates). |

---

## 1.6 Mastra (mastra-ai/mastra)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/mastra-ai/mastra | |
| Último commit | 2026-09-04T06:25:56+02:00 | FATO — CÓDIGO |
| Commits (aprox.) | 18.895 | FATO — DOC |
| Estrelas | 27,7k | FATO — DOC |
| Linguagem / framework | TypeScript; monorepo (`packages/*`), roda dentro de Next.js/Node ou como servidor | FATO — CÓDIGO |
| Banco | Plugável (`packages/core/src/storage`, adapters em `stores/`) | FATO — CÓDIGO |
| IA | Model routing multi-provedor sobre o AI SDK | FATO — DOC (README) |
| WhatsApp | **NÃO EXISTE** — nenhum canal de WhatsApp | FATO — CÓDIGO |
| Licença | Apache-2.0 + licença comercial nos diretórios `ee/` | FATO — DOC (README) + `packages/core/src/license/` |

### Características

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 3 | Agente / loop | EXISTE | `packages/core/src/agent/agent.ts`; `packages/core/src/loop/`; `agent/durable/` | Agente com laço de tools, streaming e execução durável. |
| 4 | Tools | EXISTE | `packages/core/src/tools/` e `packages/core/src/mcp/` | Tools tipadas e cliente/servidor MCP. |
| 5 | Memória | EXISTE | `packages/core/src/memory/memory.ts` → `memoryDefaultOptions` :82–100 (`lastMessages: 10`, `semanticRecall: false`, `workingMemory` com template), :384 "working memory always uses tool-call mode" | Três camadas: janela de últimas mensagens, recall semântico opcional e **working memory** (um bloco editável pelo próprio agente via tool). |
| 6 | RAG | EXISTE | `packages/rag/src/{document,graph-rag,rerank,tools}` | Chunking, rerank e graph-RAG como pacote próprio. |
| 7 | Estado | EXISTE | `packages/core/src/memory/run-state.ts`; `packages/core/src/workflows/` | Estado de run persistido; workflows com passos nomeados. |
| 9 | Múltiplas mensagens | EXISTE | `packages/core/src/processors/processors/batch-parts.ts` | Processador que agrupa partes do stream antes de emitir. |
| 28 | Handoff / intervenção humana | EXISTE | `suspend()` nos workflows — ex. `packages/core/src/workflows/concurrent-resume.test.ts` :46, `default.test.ts` :1222 | Workflow suspende esperando entrada externa e retoma depois com o payload. |
| 32 | Guardrails | EXISTE | `packages/core/src/processors/processors/{moderation.ts,pii-detector.ts,prompt-injection-detector.ts,regex-filter.ts,language-detector.ts}` | Processadores de entrada/saída encadeáveis — o análogo estrutural da cadeia `before-send` do DeskcommCRM. |
| 13 | Tratamento de erros | EXISTE | `packages/core/src/processors/stream-error-retry-processor.ts`, `prefill-error-handler.ts` | Retry de stream e recuperação de prefill. |
| 14 | Observabilidade | EXISTE | `packages/core/src/observability/`, `packages/evals/` | Traces e avaliações. |
| 10 | Filas | PARCIAL | `packages/core/src/workflows/evented/`, `background-tasks/` | Execução por eventos e tarefas de fundo; não é fila de mensagens de WhatsApp. |
| 15–27, 31, 33 | CRM, catálogo, carrinho, recomendação, qualificação, objeções, checkout, pagamento, pedido, acompanhamento, recuperação, follow-up, pós-venda, pacing, atribuição | NÃO EXISTE | — | Framework horizontal: nada de domínio comercial. |

---

## 1.7 mem0 (mem0ai/mem0)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/mem0ai/mem0 | |
| Último commit | 2026-09-02T18:44:55+05:30 | FATO — CÓDIGO |
| Commits (aprox.) | 2.621 | FATO — DOC |
| Estrelas | 64,7k | FATO — DOC |
| Linguagem | Python (`mem0/`) + TypeScript (`mem0-ts/`) | FATO — CÓDIGO |
| Banco | Vector store plugável (Qdrant padrão), grafo opcional, histórico em SQLite (`mem0/memory/storage.py`) | FATO — CÓDIGO |
| IA | LLM plugável (`mem0/llms/`) + embeddings (`mem0/embeddings/`) | FATO — CÓDIGO |
| WhatsApp / comércio | **NÃO EXISTE** | FATO — CÓDIGO |
| Licença | Apache-2.0 | FATO — CÓDIGO |

### Características

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 5 | Memória | EXISTE | `mem0/memory/main.py` → `add()` :760, `get_all()` :1255, `search()` :1379, `update()` :1815, `delete()` :1869, `delete_all()` :1890; assíncronos a partir de :2434 | API de memória com escopo por `user_id` / `agent_id` / `run_id`. |
| — | Extração de fatos | EXISTE | `mem0/configs/prompts.py` → `FACT_RETRIEVAL_PROMPT` :15 | Um LLM extrai fatos discretos da conversa em vez de guardar a transcrição. |
| — | Reconciliação de memória | EXISTE | `mem0/configs/prompts.py` → `DEFAULT_UPDATE_MEMORY_PROMPT` :176, eventos `ADD` / `UPDATE` / `DELETE` / `NONE` :182–185; `get_update_memory_messages` :406 | Ao chegar fato novo, um segundo passo decide se adiciona, atualiza, apaga ou ignora — é o que impede a memória de inchar com repetição. **Custa uma chamada extra de LLM por evento.** [INFERÊNCIA] |
| 6 | RAG | PARCIAL | `mem0/embeddings/`, vector store plugável | Recuperação semântica de memórias; não é ingestão de documentos de produto. |
| 8 | Contexto | EXISTE (parcial) | `search()` :1379 | Devolve memórias relevantes para injeção no prompt; a injeção é do chamador. |
| — | SDK TypeScript | EXISTE | `mem0-ts/src/oss/src/{memory,llms,embeddings,storage,rerankers,prompts}` | Paridade OSS em TS — relevante para uma stack Node. |
| — | Servidor | EXISTE | `server/` | API REST self-hosted. |
| Demais | agente, tools de negócio, WhatsApp, CRM, catálogo, pedido, pagamento, follow-up, handoff, pacing | NÃO EXISTE | — | É uma camada de memória, nada além. |

---

## 1.8 Chatwoot (chatwoot/chatwoot)

| Campo | Valor | Confiança |
|---|---|---|
| GitHub | https://github.com/chatwoot/chatwoot | |
| Último commit | 2026-09-03T22:44:39+05:30 | FATO — CÓDIGO |
| Commits (aprox.) | 6.739+ na `develop` | FATO — DOC |
| Estrelas | 36,5k | FATO — DOC |
| Linguagem / framework | Ruby on Rails + Vue.js | FATO — CÓDIGO |
| Banco | Postgres (com `vector(1536)` para o Captain) | FATO — CÓDIGO |
| IA | Captain — **no diretório `enterprise/`, licença comercial** | FATO — CÓDIGO (`enterprise/LICENSE` §"The Chatwoot Enterprise license") |
| WhatsApp | `app/models/channel/whatsapp.rb` :34 → `PROVIDERS = %w[default whatsapp_cloud]` — **API oficial**; Baileys/WAHA só entram por fora, via `Channel::Api` | FATO — CÓDIGO |
| Licença | MIT no núcleo; `enterprise/` sob licença comercial própria | FATO — CÓDIGO |

### Características

| # | Característica | Status | Evidência | Como funciona |
|---|---|---|---|---|
| 15 | CRM | EXISTE | `app/models/{contact.rb,contact_inbox.rb,conversation.rb,inbox.rb}` | Contato ↔ inbox ↔ conversa, com atribuição, times e rótulos. |
| 7 | Estado da conversa | EXISTE | `app/models/conversation.rb` :86 → `enum status: { open: 0, resolved: 1, pending: 2, snoozed: 3 }`; `toggle_status` :171 | Estados operacionais (não de funil de venda). |
| 28 | Handoff humano | EXISTE | `app/models/conversation.rb` → `bot_handoff!` :183–189, `dispatch_bot_handoff_event` :190; `app/models/agent_bot.rb`, `agent_bot_inbox.rb` | O bot devolve a conversa marcando-a como `open` e disparando evento — o time humano assume na mesma caixa. **É o mecanismo mais explícito de handoff entre os 8.** |
| 3 | Agente | EXISTE (enterprise) | `enterprise/app/models/captain/{assistant.rb,agent_session.rb,scenario.rb}`, `enterprise/app/services/captain/` | Assistente com sessões e cenários. |
| 4 | Tools | EXISTE (enterprise) | `enterprise/app/services/captain/tool_registry_service.rb`, `tools/{base_tool.rb,custom_http_tool.rb,search_documentation_service.rb}`; `enterprise/app/models/captain/custom_tool.rb` | Registro de tools, incluindo tool HTTP definida pelo usuário. |
| 6 | RAG | EXISTE (enterprise) | `enterprise/app/models/captain/assistant_response.rb` :9 (`embedding :vector(1536)`), :32 (`has_neighbors :embedding`), :41 (`after_commit :update_response_embedding`), :51 (`EmbeddingService#get_embedding`); `captain/document.rb`; `services/captain/{firecrawl_service.rb,simple_page_crawl_service.rb,html_page_parser.rb}` | Documentos e FAQs viram embeddings; busca por vizinhança no Postgres. Crawler embutido para ingerir site. |
| 26 | Follow-up / campanha | EXISTE | `app/models/campaign.rb` :50 (`enum campaign_type: { ongoing, one_off }`), `trigger!` :61, `execute_campaign` :92, coluna `scheduled_at` :12 | Campanhas agendadas, contínuas ou únicas. |
| — | Automação | EXISTE | `app/models/automation_rule.rb`, `automation_rule_pending_execution.rb` | Regras condição→ação sobre eventos de conversa. |
| 14 | Logs / auditoria | EXISTE (enterprise) | `enterprise/app/models/enterprise/audit_log.rb` :9 (`audited_changes :jsonb`), `enterprise/app/models/enterprise/channelable.rb` :20–33 | Auditoria de mudanças — no diretório comercial. |
| 19 | Qualificação de lead | PARCIAL | rótulos (`cached_label_list_array` :206), atributos customizados de contato | Estrutura genérica; não há funil de vendas nativo. |
| 25 | Recuperação de lead | PARCIAL | `app/models/campaign.rb` + `automation_rule.rb` | Dá para montar; não é feature nomeada. |
| 16–24, 27 | Catálogo, carrinho, recomendação, checkout, pagamento, pedido, acompanhamento, pós-venda | NÃO EXISTE | — | Chatwoot é atendimento, não comércio. |
| 31, 33 | Pacing anti-ban, atribuição de anúncio | NÃO IDENTIFICADO | — | Não localizei. Com a Cloud API o problema muda de forma. |
| 30 | Escalabilidade | EXISTE | Sidekiq + Redis + Postgres (padrão do stack Rails do projeto) | [FATO — DOC] arquitetura do projeto. |

---

# 2. Fluxo completo de venda, reconstruído por projeto

Etapas avaliadas: **entrada do lead → WhatsApp → identificação/contexto → conversa →
intenção → recomendação → objeção → coleta de dados → pagamento → pedido → confirmação →
acompanhamento → follow-up → pós-venda.**

## 2.1 DeskcommCRM — o único que percorre quase o fluxo inteiro

| Etapa | Status | Quem executa |
|---|---|---|
| Entrada do lead | IMPLEMENTADO | `lib/waha/ingest.ts` (webhook WAHA, HMAC-SHA512 :256) → `event_log` → worker |
| WhatsApp | IMPLEMENTADO | `lib/waha/send.ts`, `lib/agent-engine/edge/channel/` |
| Identificação / contexto | IMPLEMENTADO | `lib/waha/resolve-contact-whatsapp-id.ts`; atribuição de anúncio `lib/waha/atribuicao-de-anuncio.ts` :23; `lib/leads/atribuicao-de-anuncio.ts` → `estamparAtribuicaoDoContato` :56; tool `get_lead_context` |
| Conversa | IMPLEMENTADO | `lib/agent-engine/agent/inbound-turn.ts`; saída só por `send_message`; bolhas por `split-message.ts` :99 |
| Intenção | IMPLEMENTADO | `agent/intent-classifier.ts` → `classifyIntent` :90; `agent/stage-classifier.ts` → `classifyStage` :92 |
| Recomendação | PARCIAL | tool `crm_search_products` (`lib/mcp/tools/comercio.ts` :137) — busca sim, ranking não |
| Objeção | PARCIAL | `lib/agent-engine/playbooks/` + `agent/playbook.ts` (conteúdo configurável); sem componente de objeção nomeado |
| Coleta de dados | PARCIAL | `agent/abordagem-de-formulario.ts`; `update_lead_state` grava qualificação; **não** localizei coleta de endereço estruturada |
| Pagamento | NÃO IMPLEMENTADO | — |
| Pedido | PARCIAL | leitura por `crm_list_contact_orders` (`comercio.ts` :27); origem em `lib/nuvemshop/api-client.ts`. Criação: NÃO IDENTIFICADO |
| Confirmação | NÃO IDENTIFICADO | — |
| Acompanhamento | PARCIAL | `crm_list_contact_orders` responde status quando perguntado |
| Follow-up | IMPLEMENTADO | tool `schedule_followup` (`inbound-turn.ts` :177) → `agent/schedule-followup.ts` :77 → `agent/followup-turn.ts`; gatilho automático por silêncio em `lib/followup/agent-followup-gate.ts` |
| Pós-venda | NÃO IDENTIFICADO | — |

## 2.2 WAHA
Entrada do lead e WhatsApp: IMPLEMENTADO (`src/api/sessions.controller.ts`, `src/modules/waha-webhook/WebhookPlugin.sender.ts`).
Identificação: PARCIAL — entrega contato e mensagem crua (`src/api/contacts.controller.ts`), sem noção de lead.
**Todas as demais etapas: NÃO IMPLEMENTADO** — não há domínio de venda no repositório.

## 2.3 Evolution API
Entrada do lead e WhatsApp: IMPLEMENTADO (`src/api/integrations/channel/whatsapp`, `channel/meta`).
Identificação/contexto: PARCIAL — `IntegrationSession` por `remoteJid` (`base-chatbot.service.ts` :120+).
Conversa: PARCIAL — delega a Typebot/Dify/OpenAI/n8n; o laço não é dele.
Intenção: PARCIAL — só `triggerType` de entrada (`base-chatbot.controller.ts` :159–222), não intenção contínua.
Recomendação, objeção, coleta, pagamento, pedido, confirmação, acompanhamento, follow-up, pós-venda: **NÃO IMPLEMENTADO**.

## 2.4 Baileys
WhatsApp: IMPLEMENTADO (`src/Socket/messages-send.ts`, `messages-recv.ts`).
Entrada do lead: PARCIAL — evento cru com `contextInfo.externalAdReplyInfo` disponível.
**Todo o resto: NÃO IMPLEMENTADO** — é biblioteca de protocolo.

## 2.5 n8n
Entrada do lead: IMPLEMENTADO para Cloud API (`packages/nodes-base/nodes/WhatsApp/WhatsAppTrigger.node.ts`).
WhatsApp: IMPLEMENTADO, **somente oficial** (`GenericFunctions.ts` :19).
Conversa e intenção: IMPLEMENTADO como capacidade genérica (`nodes/agents/Agent/V2/AgentV2.node.ts` :142 + `nodes/memory/*`).
Recomendação, objeção, coleta, pagamento, pedido, confirmação, acompanhamento, pós-venda: **NÃO IMPLEMENTADO no repositório** — seriam workflows do usuário. [INFERÊNCIA]
Follow-up: IMPLEMENTADO como primitiva (`Schedule Trigger`, `Wait`).

## 2.6 Mastra
Conversa, intenção, contexto: IMPLEMENTADO como framework (`packages/core/src/agent/agent.ts`, `memory/memory.ts` :82–100).
Coleta de dados: PARCIAL — `workflows/` com `suspend()` permite formulário conversacional passo a passo.
Todas as etapas de comércio (recomendação, objeção, pagamento, pedido, acompanhamento, pós-venda): **NÃO IMPLEMENTADO**.
Entrada do lead / WhatsApp: **NÃO IMPLEMENTADO** — sem canal.

## 2.7 mem0
Apenas a etapa de **contexto**: IMPLEMENTADO (`mem0/memory/main.py` `search()` :1379, `add()` :760).
Todas as outras 13 etapas: **NÃO IMPLEMENTADO**.

## 2.8 Chatwoot
Entrada do lead: IMPLEMENTADO (`app/services/whatsapp/incoming_message_whatsapp_cloud_service.rb`).
WhatsApp: IMPLEMENTADO, oficial (`app/models/channel/whatsapp.rb` :34).
Identificação/contexto: IMPLEMENTADO (`app/models/contact_inbox.rb`, `contact.rb`).
Conversa: IMPLEMENTADO para humano; para bot, via `agent_bot.rb` / Captain (enterprise).
Intenção, recomendação, objeção: PARCIAL, dentro do Captain (`enterprise/app/services/captain/`).
Coleta de dados: PARCIAL — atributos customizados de contato.
Pagamento, pedido, confirmação, acompanhamento: **NÃO IMPLEMENTADO**.
Follow-up: IMPLEMENTADO como campanha (`app/models/campaign.rb` :50–92).
Pós-venda: PARCIAL — CSAT (`app/services/whatsapp/csat_template_service.rb`).

### Leitura do conjunto [INFERÊNCIA]
Nenhum dos 8 fecha o fluxo. O trecho **pagamento → pedido → confirmação → acompanhamento →
pós-venda** está vazio ou parcial em todos, sem exceção. É exatamente o trecho onde nosso
dinheiro é ganho ou perdido (entrega paga = +R$ 63,35; recusa = −R$ 14,98 ou −R$ 54,98).

---

# 3. Comparação característica por característica

Legenda: ✅ existe · 🟡 parcial · ❌ não existe · ❔ não identificado.
Colunas: **DK**=DeskcommCRM · **WA**=WAHA · **EV**=Evolution · **BA**=Baileys · **N8**=n8n · **MA**=Mastra · **M0**=mem0 · **CW**=Chatwoot.

| Característica | DK | WA | EV | BA | N8 | MA | M0 | CW |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Linguagem TypeScript | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(SDK) | ❌ (Ruby) |
| Framework web próprio | ✅ Next 16 | ✅ Nest | ✅ Express | ❌ | ✅ | 🟡 | 🟡 | ✅ Rails |
| Banco relacional | ✅ Postgres | ❌ Mongo | ✅ Prisma | ❌ | ✅ | 🟡 plugável | 🟡 SQLite hist. | ✅ Postgres |
| Provedor de IA | ✅ AI SDK v7 | ❌ | 🟡 OpenAI | ❌ | ✅ LangChain | ✅ multi | ✅ plugável | ✅ (enterprise) |
| WhatsApp não oficial | ✅ via WAHA | ✅ 4 engines | ✅ Baileys | ✅ nativo | ❌ | ❌ | ❌ | ❌ |
| WhatsApp oficial (Cloud API) | ✅ `lib/channels/meta` | 🟡 | ✅ `channel/meta` | ❌ | ✅ | ❌ | ❌ | ✅ |
| Orquestração / workers | ✅ event_log+cron | 🟡 BullMQ | 🟡 brokers | ❌ | ✅ modo fila | 🟡 evented | ❌ | ✅ Sidekiq |
| Agente / loop autônomo | ✅ | ❌ | 🟡 threads OpenAI | ❌ | ✅ | ✅ | ❌ | ✅ enterprise |
| Tools / function calling | ✅ 12 tools | ✅ servidor MCP | ❔ | ❌ | ✅ | ✅ | ❌ | ✅ enterprise |
| Memória (fatos duráveis) | ✅ lead notes | ❌ | 🟡 thread | ❌ | 🟡 histórico | ✅ working memory | ✅ especialista | ❔ |
| RAG / conhecimento | ✅ | ❌ | ❌ | ❌ | ✅ tool | ✅ pacote | 🟡 | ✅ enterprise |
| Estado da conversa (funil) | ✅ máquina de estados | ❌ | 🟡 sessão | ❌ | ❌ | 🟡 run-state | ❌ | 🟡 status operacional |
| Gerenciamento de contexto | ✅ compaction | ❌ | ❌ | ❌ | 🟡 janela | ✅ camadas | 🟡 | ❔ |
| Múltiplas mensagens (debounce/bolhas) | ✅ bolhas | 🟡 typing | ✅ debounceTime | ✅ event buffer | ❔ | 🟡 batch-parts | ❌ | ❔ |
| Filas / concorrência | ✅ + advisory lock | ✅ BullMQ | ✅ brokers | ❌ | ✅ Redis | 🟡 | ❌ | ✅ |
| Retries | ✅ circuit breaker | ✅ webhook | ✅ broker | ✅ protocolo | ✅ por nó | ✅ stream | ❔ | ✅ |
| Idempotência | ✅ unique+23505 | ❔ | ❔ | ❌ | ❔ | ❔ | ❌ | ❔ |
| Tratamento de erro instrutivo ao modelo | ✅ | — | ❌ | — | ❌ | 🟡 | ❌ | ❔ |
| Logs / auditoria | ✅ trace por gate | ✅ | 🟡 | ❌ | ✅ execuções | ✅ | ❔ | ✅ enterprise |
| CRM | ✅ | 🟡 Chatwoot | 🟡 Chatwoot | ❌ | ❌ | ❌ | ❌ | ✅ |
| Catálogo | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Carrinho | ❔ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Recomendação de produto | 🟡 busca | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Qualificação de lead | ✅ BANT | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 rótulos |
| Tratamento de objeções | 🟡 playbook | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 Captain |
| Checkout | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pagamento | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Criação de pedido | ❔ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Acompanhamento de pedido | 🟡 leitura | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Recuperação de lead abandonado | ✅ silence sweep | ❌ | ❌ | ❌ | 🟡 primitivas | ❌ | ❌ | 🟡 campanha |
| Follow-up automático | ✅ tool + gate | ❌ | ❌ | ❌ | ✅ Schedule/Wait | ❌ | ❌ | ✅ campanha |
| Pós-venda | ❔ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 🟡 CSAT |
| Handoff humano | ✅ sentinela+tool | ❌ | 🟡 keyword | ❌ | 🟡 doc | ✅ suspend | ❌ | ✅ `bot_handoff!` |
| Guardrails de conteúdo | ✅ 11 gates | ❌ | ❌ | ❌ | ❌ | ✅ processors | ❌ | ❔ |
| Pacing anti-banimento | ✅ | ❌ | 🟡 delayMessage | ❌ | ❌ | ❌ | ❌ | ❌ |
| Atribuição de anúncio (ctwa) | ✅ | ❌ (dado cru) | ❔ | 🟡 dado cru | ❌ | ❌ | ❌ | ❔ |
| Segurança (HMAC/allowlist) | ✅ | ✅ HMAC | 🟡 apikey | — | ✅ | 🟡 | ❔ | ✅ |
| Escalabilidade | 🟡 | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| Multi-tenancy | ✅ RLS | ✅ sessões | ✅ instâncias | ❌ | ✅ projetos | 🟡 | ✅ escopos | ✅ contas |
| Testes automatizados no repo | ✅ | ✅ | 🟡 | ✅ | ✅ | ✅ | ✅ | ✅ |

## 3.1 Quem tem a implementação mais completa de cada característica

| Característica | Mais completo | Por quê (evidência) |
|---|---|---|
| Transporte WhatsApp não oficial | **WAHA** | 4 engines intercambiáveis (`src/core/engines/`) + retry e HMAC de webhook (`WebhookPlugin.sender.ts` :150–204) |
| Protocolo puro | **Baileys** | É a implementação; os outros a embrulham |
| Ecossistema de integrações prontas | **Evolution** | 8 chatbots + 7 transportes de evento em `src/api/integrations/` |
| Loop de agente + tools em TS | **Mastra** | `agent/`, `loop/`, `tools/`, `mcp/`, `processors/` |
| Memória de fatos | **mem0** | extração + reconciliação ADD/UPDATE/DELETE/NONE (`prompts.py` :176–185) |
| Memória prática dentro do agente | **Mastra** | working memory em modo tool-call (`memory/memory.ts` :384) |
| RAG | **Mastra** (`packages/rag`) e **Chatwoot Captain** (embeddings em Postgres) | |
| Estado de funil de venda | **DeskcommCRM** | `lead-state.ts` :23–45 com transições válidas e regressão proibida |
| Guardrails antes do envio | **DeskcommCRM** | 11 gates versionados (`before-send.ts` :660–693) |
| Handoff humano | **Chatwoot** (`bot_handoff!` :183) e **DeskcommCRM** (sentinela + tool) | |
| Follow-up | **DeskcommCRM** (tool + gate) e **n8n** (Schedule/Wait como primitiva) | |
| Filas e retries genéricos | **n8n** | modo fila com Redis + retry por nó (`interfaces.ts` :1663–1665) |
| Auditoria de decisão do agente | **DeskcommCRM** | trace por gate persistido (`GateTraceEntry` :694) |
| Anti-banimento | **DeskcommCRM** | `pacing/engine.ts` :56–201 |
| Atribuição Meta Ads → WhatsApp | **DeskcommCRM** | `lib/waha/atribuicao-de-anuncio.ts` :23–56, com filtro de post orgânico |
| Caixa de entrada humana | **Chatwoot** | modelo completo de inbox/atribuição/rótulos |

## 3.2 Outras leituras comparativas

**Tecnicamente mais simples:** Baileys — uma dependência, sem serviço, sem banco.
Depois dele, mem0 como biblioteca.

**Mais escalável:** n8n (modo fila com Redis, workers e multi-main) e Chatwoot (Sidekiq),
ambos com anos de produção. WAHA escala por sessão. DeskcommCRM escala por worker mas o
próprio `ARCHITECTURE.md` registra rate limit aplicado em só 2 pontos.

**Mais próximo do nosso stack** (TypeScript, React, Vite/Next, pnpm, SQLite ou Postgres):
DeskcommCRM (Next 16 + TS strict + Zod + AI SDK) > Mastra > WAHA/Evolution/Baileys > n8n
(TS, mas a lógica vira JSON) > mem0 (SDK TS existe, núcleo é Python) > Chatwoot (Ruby, fora
da nossa stack).

**Maior potencial de reutilização:**
1. DeskcommCRM — padrões prontos e no nosso idioma e stack;
2. Mastra — biblioteca que dá para importar de verdade;
3. Baileys/WAHA — transporte, uso direto sem adaptação;
4. mem0 — conceito e, se quisermos, o SDK TS;
5. n8n — orquestração externa;
6. Evolution — referência de integração;
7. Chatwoot — padrão de handoff (o código é Ruby, não vem);
8. — 

---

# 4. Comparação com o nosso projeto

## 4.1 O que existe hoje, medido

Dois repositórios, e é importante não confundi-los:

**`colet-cinta-modeladora`** — [FATO — CÓDIGO] SPA Vite + React 18 + TypeScript 5.8 +
Tailwind 3.4. 88 arquivos em `src/` (dos quais 49 são componentes shadcn/ui não usados pela
landing). Scripts: `dev`, `build`, `lint`, `test` (`vitest run`). **Não há backend, não há
banco, não há servidor, não há workflow de CI** (`.github/workflows` não existe).

**`ricos-com-ai`** — [FATO — CÓDIGO] **nenhum arquivo de código**. `find` por `*.ts`,
`*.tsx` e `package.json` retorna vazio. O repositório contém `CLAUDE.md`, `README.md`,
`.claude/` e `docs/` (16 arquivos). `docs/PROMPT.md` (348 linhas) é uma **especificação**
de sistema comercial autônomo — e ela é de **Instagram**, não de WhatsApp: o WhatsApp
aparece como destino de encaminhamento (`docs/PROMPT.md` :153–155), não como canal do
agente. `.claude/memory/MEMORY.md` está vazio ("Nenhuma memória registrada ainda").

## 4.2 Matriz

| CARACTERÍSTICA | JÁ TEMOS | COMO IMPLEMENTAMOS (arquivo → símbolo → linhas) | REPOSITÓRIOS QUE FAZEM MELHOR | O QUE ESTÁ FALTANDO | RELEVÂNCIA |
|---|---|---|---|---|---|
| Canal WhatsApp | **NÃO** | Só links `wa.me`: `colet/src/components/landing/WhatsAppFloat.tsx` :4 e `colet/src/pages/ThankYou.tsx` :44 (com texto pré-preenchido). Nenhuma API. | WAHA, Evolution, Baileys | Tudo: sessão, envio, recebimento, webhook | **CRÍTICA** |
| Atribuição de origem | **PARCIAL** | `colet/src/lib/checkout.ts` → `TRACKING_PARAMS` :9–19 e `goToCheckout` :21–35 repassam `fbclid`/`utm_*` **para o checkout**. O link do WhatsApp (`WhatsAppFloat.tsx` :4) **não carrega nenhum parâmetro**. | DeskcommCRM (`lib/waha/atribuicao-de-anuncio.ts` :23–56) | Captura de `ctwa_clid`/`externalAdReplyInfo` na entrada do WhatsApp; carimbo de primeiro toque no lead | **CRÍTICA** |
| Pixel / eventos | **PARCIAL** | `colet/src/lib/pixel.ts` → `track` :25, `PRODUCT` :33; `SizeSelector.tsx` :43 dispara `AddToCart`; `checkout.ts` :22 dispara `InitiateCheckout` | — | Eventos do funil de WhatsApp; separar pedido criado de pedido pago (pendência já registrada em `docs/contexto-do-projeto.md` §6) | ALTA |
| Configuração de negócio | **PARCIAL** | `colet/src/config/business.ts` — 3 campos (`brand`, `email`, `whatsapp`). `ricos-com-ai/CLAUDE.md` exige `config/business.json`, que **não existe** em nenhum dos dois repos | DeskcommCRM (config por org no banco) | Catálogo, preço, tabela de medidas, prazos, claims verificados, tom de voz — hoje espalhados em componentes React | ALTA |
| Preço e desconto | **PARCIAL** | `colet/src/lib/checkout.ts` → `PREPAY_DISCOUNT` :42–49, `enabled: false`, com comentário explicando que ligar antes da Coinzz repetiria o erro da promessa quebrada | DeskcommCRM (gate `promiseGate` valida preço antes do envio) | Fonte única de preço legível pelo agente; validação de promessa de preço | ALTA |
| Conteúdo de objeção | **SIM (como copy)** | `colet/src/components/landing/Objection.tsx` :10–13 (4 blocos: dinheiro na entrega, ver antes de pagar, 7 dias, WhatsApp humano); `FAQ.tsx` :11–26 (4 perguntas); `HowItWorks.tsx` :4–6 (3 passos); `Testimonials.tsx` (4 depoimentos) | Chatwoot Captain (FAQ → embedding), DeskcommCRM (`lib/ai/rag/ingest/faq.ts`) | Esse conteúdo não está em formato consumível por agente: está dentro de JSX | **ALTA** — é a nossa base de conhecimento pronta, no lugar errado |
| Agente / loop | **NÃO** | — | DeskcommCRM, Mastra, n8n | Tudo | **CRÍTICA** |
| Tools / function calling | **NÃO** | — | DeskcommCRM (12 tools), Mastra | Tudo | **CRÍTICA** |
| Memória | **NÃO** | `ricos-com-ai/.claude/memory/MEMORY.md` é memória **do Claude Code entre sessões**, não do agente de vendas — e está vazia | mem0, Mastra, DeskcommCRM | Tudo | ALTA |
| RAG / conhecimento | **NÃO** | — | Chatwoot Captain, Mastra, DeskcommCRM | Tudo. [INFERÊNCIA] Com um produto só e ~10 fatos, RAG pode ser desnecessário: cabe no prompt | MÉDIA |
| Estado da conversa | **NÃO** | — | DeskcommCRM (`lead-state.ts` :23–45) | Tudo | **CRÍTICA** |
| Banco de dados | **NÃO** | Nenhum. `ricos-com-ai/CLAUDE.md` §Stack declara SQLite + Drizzle — **declarado, não implementado** | Todos | Schema, migrações, persistência | **CRÍTICA** |
| Filas / worker | **NÃO** | `ricos-com-ai/docs/PROMPT.md` :240 prevê `src/worker` e :253 "tabela de jobs no SQLite no lugar de Redis" — **spec, não código** | DeskcommCRM (`queue/queue.ts` :69–242), n8n | Tudo | **CRÍTICA** |
| Retries / idempotência | **NÃO** | — | DeskcommCRM, WAHA, n8n | Tudo | ALTA |
| Logs / auditoria | **NÃO** | — | DeskcommCRM (trace por gate) | Tudo | MÉDIA |
| CRM | **NÃO** | — | Chatwoot, DeskcommCRM | Tudo. [INFERÊNCIA] para 1 produto e 1 operador, uma tabela `leads` pode bastar | MÉDIA |
| Catálogo | **NÃO precisa (parcial)** | Um produto, 5 tamanhos: `colet/src/components/landing/SizeSelector.tsx` :5 → `SIZES = ["P","M","G","GG","XGG"]` | DeskcommCRM | Tabela de medidas legível pelo agente (existe na LP como imagem/JSX) | MÉDIA |
| Carrinho | **NÃO — e não precisa** | Compra de 1 item | — | — | BAIXA |
| Recomendação | **PARCIAL** | Escolha de tamanho é a única recomendação; hoje é o FAQ que orienta ("na dúvida entre dois, pegue o maior", `FAQ.tsx` :16–20) | — | Recomendação de tamanho por medida informada no WhatsApp | ALTA |
| Qualificação de lead | **NÃO** | — | DeskcommCRM (BANT no schema da tool) | [INFERÊNCIA] BANT não serve aqui: nosso lead é B2C de R$ 129,90. Qualificar = tamanho + endereço + disposição a pagar na entrega | MÉDIA |
| Checkout | **PARCIAL (externo)** | `colet/src/lib/checkout.ts` :3 → `CHECKOUT_URL` Coinzz | — | Como o agente cria pedido sem mandar a cliente para o navegador | **CRÍTICA** |
| Pagamento | **NÃO (externo)** | Coinzz/Logzz, fora do código | Nenhum dos 8 | Modelo COD não existe em nenhuma referência | **CRÍTICA** |
| Criação de pedido | **NÃO** | — | Nenhum dos 8 | API/automação da Coinzz ou Logzz para criar pedido a partir da conversa | **CRÍTICA** |
| Acompanhamento de pedido | **NÃO** | Pendência registrada em `docs/contexto-do-projeto.md` §6 ("4 pedidos parados em A enviar") | DeskcommCRM (leitura de pedidos) | Status de entrega para o agente responder e para avisar a véspera | **CRÍTICA** |
| Recuperação de abandono | **NÃO** | Buraco já reconhecido: `docs/funil-e-jornada.md` §Buracos conhecidos, meta de 25% sem mecanismo | DeskcommCRM, n8n, Chatwoot | Tudo | ALTA |
| Follow-up automático | **NÃO** | — | DeskcommCRM (tool + gate), n8n (Schedule/Wait) | Tudo | **CRÍTICA** (é a função nº 3 do `agente-whatsapp.md`) |
| Pós-venda | **NÃO** | `docs/funil-e-jornada.md` Etapa 13: "ainda não construída" | Chatwoot (CSAT) | Tudo | ALTA |
| Handoff humano | **NÃO** | Pergunta em aberto no nosso `docs/agente-whatsapp.md` §"Ainda em aberto" | Chatwoot (`bot_handoff!` :183), DeskcommCRM | Tudo | **CRÍTICA** |
| Guardrails | **PARCIAL (como regra escrita)** | Regra existe em prosa: `docs/agente-whatsapp.md` §Tom de voz ("nunca prometer o que a operação não cumpre") e `HANDOFF.md` §Decisões ("não afirmar 'nada de PIX antes'") | DeskcommCRM (`before-send.ts` :681–693), Mastra (`processors/`) | Nenhuma verificação executável | **CRÍTICA** |
| Pacing anti-banimento | **NÃO** | — | DeskcommCRM (`pacing/engine.ts` :56–201) | Tudo. Agrava-se porque o número candidato é o mesmo do botão do site | **CRÍTICA** |
| Segurança | **NÃO aplicável ainda** | `.gitignore` cobre `.env`, `config/business.json`, `.chrome-profile/` (`ricos-com-ai/CLAUDE.md` §Segredos) | WAHA (HMAC), DeskcommCRM | Verificação de webhook, allowlist de egress | ALTA |
| Testes | **PARCIAL** | `colet/src/test/example.test.ts` :3–7 — um teste `expect(true).toBe(true)`. Vitest configurado, sem cobertura real | Todos | Testes de verdade | MÉDIA |
| Especificação do agente | **SIM (parcial)** | `ricos-com-ai/docs/PROMPT.md` :159–173 (motor de conversação, 11 intenções, 9 ações, orçamento de IA), :199 (pipeline de 9 estágios), :225–262 (arquitetura modular monolith + SQLite) | — | A spec é de **Instagram**; precisa ser reescrita para WhatsApp inbound | ALTA |

## 4.3 Três achados que mudam a leitura

1. **[FATO — CÓDIGO] Não temos software de agente. Temos uma landing page e duas
   especificações.** Nada em `JÁ TEMOS` acima é infraestrutura reaproveitável para o agente,
   exceto conteúdo (copy) e a configuração de contato.

2. **[FATO — CÓDIGO] A spec que temos é do canal errado.** `docs/PROMPT.md` descreve
   prospecção ativa no Instagram (`src/integrations/instagram`, Playwright via CDP, funil de
   afiliados). Nossa campanha é **inbound** por Meta Ads → WhatsApp. As partes reaproveitáveis
   da spec são as transversais: orçamento de IA, `do_not_contact`, tabela de jobs em SQLite,
   idioma, clean code. O funil e o canal, não.

3. **[FATO — CÓDIGO] Nosso melhor ativo para o agente é copy, e está preso em JSX.**
   `Objection.tsx`, `FAQ.tsx`, `HowItWorks.tsx`, `Testimonials.tsx` e `Offer.tsx` contêm as
   respostas às objeções reais, já validadas em tráfego, escritas no tom certo. Hoje só um
   navegador consegue lê-las.

---

# 5. Mapa funcional do agente que precisamos

Base: **exclusivamente** o nosso projeto + os 8 repositórios. Nenhuma tecnologia está
escolhida — "SISTEMA RESPONSÁVEL" descreve o **papel**, não o produto que o cumprirá.

## A. Aquisição

| Item | Especificação |
|---|---|
| **A1. Clique no anúncio** | ENTRADA: clique em anúncio Click-to-WhatsApp no Instagram/Facebook → PROCESSAMENTO: o app do WhatsApp anexa `contextInfo.externalAdReplyInfo` à primeira mensagem → SAÍDA: primeira mensagem com metadados do anúncio → DADOS: `ctwa_clid`, `sourceId`, `title`, `body`, `sourceUrl`, `sourceType` → SISTEMA: transporte WhatsApp + extrator de atribuição. Referência: DeskcommCRM `lib/waha/atribuicao-de-anuncio.ts` :23–56. |
| **A2. Identificação de campanha** | ENTRADA: metadados de A1 → PROCESSAMENTO: descartar `sourceType != 'ad'` (post orgânico compartilhado não é anúncio); casar `ctwa_clid` com campanha/anúncio → SAÍDA: lead carimbado com origem → DADOS: campanha, conjunto, criativo → SISTEMA: extrator + tabela `leads`. **Regra de primeiro toque: a origem grava uma vez e não é sobrescrita.** |
| **A3. Conversão para o Meta** | ENTRADA: eventos do funil de conversa → PROCESSAMENTO: enviar conversão com `ctwa_clid` → SAÍDA: otimização da campanha por evento real → DADOS: evento, valor, `ctwa_clid` → SISTEMA: integração de conversões. **Sem isto repetimos o erro do CPA de R$ 47 vs R$ 165** (`colet/docs/contexto-do-projeto.md` §4). |
| **A4. Coexistência com a LP** | ENTRADA: dois caminhos (anúncio→WhatsApp e anúncio→LP→checkout) → PROCESSAMENTO: reconhecer se a pessoa vem do botão flutuante da LP (`WhatsAppFloat.tsx` :4), da página de obrigado (`ThankYou.tsx` :44) ou direto do anúncio → SAÍDA: contexto de abertura diferente para cada um → DADOS: origem, pedido preexistente → SISTEMA: extrator + tabela `leads`. **Hoje o link da LP não carrega nenhum parâmetro — é o primeiro buraco a fechar.** |

## B. Conversação

| Item | Especificação |
|---|---|
| **B1. Recepção** | ENTRADA: webhook de mensagem → PROCESSAMENTO: verificar assinatura, deduplicar por id externo, gravar evento, enfileirar → SAÍDA: job de turno → DADOS: `external_id`, telefone, corpo, mídia → SISTEMA: webhook + fila. Referências: WAHA HMAC (`WebhookPlugin.sender.ts` :150–177), DeskcommCRM `lib/waha/ingest.ts` :256, idempotência por `unique + 23505`. |
| **B2. Agregação de mensagens picadas** | ENTRADA: 2–5 mensagens em segundos (comportamento normal no WhatsApp) → PROCESSAMENTO: janela de debounce antes de acionar o modelo → SAÍDA: um turno com o texto consolidado → DADOS: janela em ms → SISTEMA: fila. Referência: Evolution `debounceTime` (`base-chatbot.controller.ts` :23, :108). **Sem isso o agente responde três vezes à mesma pessoa.** |
| **B3. Entendimento da intenção** | ENTRADA: turno consolidado + estado → PROCESSAMENTO: classificador barato antes do turno caro → SAÍDA: rótulo de intenção → DADOS: taxonomia. **Já temos uma taxonomia escrita**: `ricos-com-ai/docs/PROMPT.md` :165 (11 intenções) — precisa ser adaptada ao inbound. Referência: DeskcommCRM `intent-classifier.ts` :90. |
| **B4. Contexto do turno** | ENTRADA: lead + histórico + conhecimento → PROCESSAMENTO: montar prompt com identidade, oferta, claims permitidos, estado, últimas N mensagens e fatos duráveis → SAÍDA: contexto → DADOS: perfil, estágio, notas, tamanho, endereço, pedido → SISTEMA: montador de contexto. Referências: Mastra `memoryDefaultOptions` :82–100; DeskcommCRM `compaction.ts` :113–190. |
| **B5. Resposta** | ENTRADA: contexto → PROCESSAMENTO: modelo decide texto e/ou tool → SAÍDA: mensagem(ns) → SISTEMA: motor do agente. **Regra estrutural a herdar:** texto só sai por tool `send_message` (DeskcommCRM `inbound-turn.ts` :154–161) — nada que o modelo escreva fora dela chega à cliente. |
| **B6. Ritmo humano** | ENTRADA: resposta longa → PROCESSAMENTO: quebrar em bolhas, aplicar "digitando", espaçar → SAÍDA: 1–3 mensagens → SISTEMA: adapter de canal. Referências: DeskcommCRM `split-message.ts` :7, :99; WAHA `startTyping` (`chatting.controller.ts` :259). |

## C. Venda

| Item | Especificação |
|---|---|
| **C1. Descoberta** | ENTRADA: primeiras mensagens → PROCESSAMENTO: identificar o momento dela (a roupa que não cai bem, o evento, a insegurança) — os "Momentos" da LP são a taxonomia pronta (`colet/src/components/landing/Moments.tsx`) → SAÍDA: necessidade nomeada → DADOS: motivo declarado → SISTEMA: agente + memória. |
| **C2. Apresentação** | ENTRADA: necessidade → PROCESSAMENTO: apresentar o que o produto faz **e o que não faz** → SAÍDA: mensagem → DADOS: claims verificados. **Restrição herdada do nosso repo:** não emagrece, o efeito acaba ao tirar (`colet/docs/contexto-do-projeto.md` §2, `FAQ.tsx` :26). Isso é regra dura, não estilo. |
| **C3. Recomendação de tamanho** | ENTRADA: medida ou descrição corporal → PROCESSAMENTO: mapear para P–XGG; na dúvida entre dois, o maior (`FAQ.tsx` :16–20) → SAÍDA: tamanho recomendado → DADOS: tabela de medidas (hoje só na LP) → SISTEMA: tool determinística, não o LLM adivinhando. |
| **C4. Objeções** | ENTRADA: objeção → PROCESSAMENTO: responder com o argumento já validado → SAÍDA: mensagem → DADOS: as 4 objeções de `Objection.tsx` :10–13 + 4 do `FAQ.tsx` → SISTEMA: base de conhecimento do agente. **A objeção dominante é golpe, não preço** (`docs/contexto-do-projeto.md` §1). |
| **C5. Preço** | ENTRADA: pergunta de preço ou momento de fechar → PROCESSAMENTO: R$ 129,90 com frete embutido, **depois** de o medo ser nomeado (ordem do funil, `docs/funil-e-jornada.md` Etapa 5) → SAÍDA: mensagem → DADOS: preço de fonte única → SISTEMA: agente + guardrail de promessa de preço (DeskcommCRM `promiseGate`). |
| **C6. Fechamento** | ENTRADA: sinal de compra → PROCESSAMENTO: transição de estado + pedir dados → SAÍDA: início da coleta → SISTEMA: máquina de estados (referência: `lead-state.ts` :23–45, com regressão proibida). |

## D. Conversão

| Item | Especificação |
|---|---|
| **D1. Nome** | ENTRADA: texto → PROCESSAMENTO: extrair e confirmar → SAÍDA: campo → SISTEMA: tool de coleta com schema. |
| **D2. Endereço** | ENTRADA: texto livre → PROCESSAMENTO: extrair CEP, rua, número, complemento, bairro, cidade, UF; validar CEP; **confirmar repetindo de volta** → SAÍDA: endereço estruturado → DADOS: endereço + área de entrega da Logzz → SISTEMA: tool + validação. [HIPÓTESE] a lista de exclusão geográfica, que `docs/funil-e-jornada.md` marca como não feita, entra aqui. |
| **D3. Modalidade de pagamento** | ENTRADA: escolha → PROCESSAMENTO: **enquanto `Físico na entrega` não estiver ativo na Coinzz, o agente não pode afirmar que não haverá cobrança antes da entrega** (`docs/agente-whatsapp.md` §Tom de voz) → SAÍDA: modalidade → SISTEMA: guardrail executável, não instrução no prompt. |
| **D4. Pagamento** | ENTRADA: modalidade → PROCESSAMENTO: COD = nada agora, dinheiro/cartão/maquininha na porta (`ThankYou.tsx` :40) → SAÍDA: expectativa correta → DADOS: R$ 129,90 → SISTEMA: agente. **Nenhuma das 8 referências implementa COD.** |
| **D5. Confirmação** | ENTRADA: dados completos → PROCESSAMENTO: repetir tamanho + endereço + valor + forma e pedir confirmação explícita → SAÍDA: aceite → SISTEMA: agente + registro. |

## E. Pedido

| Item | Especificação |
|---|---|
| **E1. Criação** | ENTRADA: dados confirmados → PROCESSAMENTO: criar o pedido no sistema que a operação usa (Coinzz/Logzz) → SAÍDA: `order_id` → SISTEMA: integração. **Lacuna total: NÃO IDENTIFICADO em nenhuma das 8 referências, nem no nosso código.** Alternativa observada: DeskcommCRM só **lê** pedidos (`crm_list_contact_orders` :27). |
| **E2. Registro local** | ENTRADA: `order_id` → PROCESSAMENTO: gravar vínculo lead↔pedido com idempotência → SAÍDA: linha durável → SISTEMA: banco. |
| **E3. Status** | ENTRADA: webhook/polling da Coinzz → PROCESSAMENTO: atualizar estado → SAÍDA: estado do pedido → SISTEMA: worker. Gatilho já mapeado no nosso repo: `docs/agente-whatsapp.md` §Ainda em aberto (webhook da Coinzz). |
| **E4. Logística** | ENTRADA: status Logzz (7–14 dias, entrega agendada) → PROCESSAMENTO: traduzir para linguagem da cliente → SAÍDA: aviso → SISTEMA: worker + agente. |
| **E5. Atualização à cliente** | ENTRADA: mudança de status → PROCESSAMENTO: decidir se merece mensagem → SAÍDA: mensagem → SISTEMA: follow-up. **É a alavanca contra a recusa na porta.** |

## F. Recuperação

| Item | Especificação |
|---|---|
| **F1. Não respondeu a primeira** | ENTRADA: silêncio após entrada do anúncio → PROCESSAMENTO: varredura por tempo → SAÍDA: reengajamento → SISTEMA: sweep + fila. Referência: DeskcommCRM `lib/followup/agent-followup-gate.ts` (gatilho `silence`). |
| **F2. Abandono no meio da venda** | ENTRADA: silêncio com estágio avançado → PROCESSAMENTO: retomar do ponto exato → DADOS: estágio + última pergunta → SISTEMA: sweep + estado. |
| **F3. Abandono na coleta/pedido** | ENTRADA: dados incompletos → PROCESSAMENTO: pedir só o que falta → SISTEMA: estado + agente. |
| **F4. Cadência** | ENTRADA: enrollment → PROCESSAMENTO: N tentativas com espaçamento, respeitando opt-out e janela de horário → SAÍDA: mensagens → SISTEMA: agendador + gates. Referências: DeskcommCRM `schedule_followup` (:177) e `pacing/engine.ts` :201; n8n `Schedule Trigger`/`Wait`. |

## G. Pós-venda

| Item | Especificação |
|---|---|
| **G1. Confirmação pós-pedido** | ENTRADA: pedido criado → PROCESSAMENTO: mensagem no mesmo dia confirmando tamanho e endereço e apresentando a pessoa do outro lado → SAÍDA: contato salvo → SISTEMA: follow-up. Definido no nosso repo: `docs/agente-whatsapp.md` §"Confirmação de pedido e acolhimento". |
| **G2. Sinal de vida no trajeto** | ENTRADA: pedido em rota → PROCESSAMENTO: mensagem curta para ela não esquecer → SISTEMA: follow-up. |
| **G3. Véspera da entrega** | ENTRADA: data prevista → PROCESSAMENTO: avisar dia, valor e formas de pagamento → SAÍDA: mensagem → **é a mensagem que evita a recusa por surpresa**. |
| **G4. Depois de receber** | ENTRADA: entrega confirmada → PROCESSAMENTO: perguntar se serviu, ensinar primeiro uso, pedir foto/depoimento → SAÍDA: prova social → **fecha o buraco da Etapa 4 do funil** (`docs/funil-e-jornada.md`). |
| **G5. Suporte e troca** | ENTRADA: problema → PROCESSAMENTO: 7 dias a partir do recebimento (`FAQ.tsx` :16–20) → SISTEMA: agente + handoff. |
| **G6. Recompra** | ENTRADA: cliente satisfeita → PROCESSAMENTO: segunda peça/indicação → SISTEMA: campanha. NÃO IDENTIFICADO em qualquer referência com implementação madura. |

## H. Inteligência

| Item | Especificação |
|---|---|
| **H1. Memória** | ENTRADA: fatos ditos na conversa → PROCESSAMENTO: gravar fato durável (tamanho, medo declarado, evento, endereço) → SAÍDA: recall no turno seguinte → SISTEMA: tabela + tool. Referências: DeskcommCRM `save_lead_note`/`get_lead_note`; mem0 `FACT_RETRIEVAL_PROMPT` :15 e reconciliação :176–185. **[INFERÊNCIA] no nosso caso a maioria dos "fatos" são campos estruturados, não texto semântico.** |
| **H2. Contexto** | ENTRADA: histórico → PROCESSAMENTO: janela + compactação por orçamento → SISTEMA: montador. Referência: `compaction.ts` :113. |
| **H3. Conhecimento** | ENTRADA: perguntas da cliente → PROCESSAMENTO: responder a partir de fonte controlada (objeções, FAQ, medidas, prazos, política de troca) → SISTEMA: base de conhecimento. **Fonte já existe: os componentes da LP.** |
| **H4. Ferramentas** | Conjunto mínimo derivado do que observamos: `send_message`, `recommend_size`, `save_lead_fact`, `update_lead_state`, `create_order`, `get_order_status`, `schedule_followup`, `request_human_handoff`. Referência de forma: `AGENT_TOOL_DEFS` (`inbound-turn.ts` :148–308). |
| **H5. Estado** | Máquina de estados própria do nosso funil COD — **não** o BANT do DeskcommCRM: `novo → conversando → tamanho_definido → endereco_coletado → pedido_criado → em_rota → entregue_pago \| recusado \| perdido`. Transições declaradas e regressão proibida (forma de `lead-state.ts` :35–45). |
| **H6. Histórico** | Toda mensagem, decisão e chamada de tool persistidas com custo. Referência: DeskcommCRM `lib/ai/runtime/cost.ts` + teto por conversa que vira handoff (`inbound-turn.ts` :432). Nossa spec já pede o equivalente: `ricos-com-ai/docs/PROMPT.md` :173 (tabela `ai_calls`, orçamento mensal, pausa ao atingir teto). |
| **H7. Decisões do agente** | Cada envio registra quais verificações passaram e quais vetaram. Referência: `GateTraceEntry` (`before-send.ts` :694–701). |

---

# 6. Reutilização

## 6.1 COPIAR / REUTILIZAR CÓDIGO

| Repo | Arquivo/componente | Função | Motivo | Relação com o nosso projeto |
|---|---|---|---|---|
| DeskcommCRM | `lib/waha/atribuicao-de-anuncio.ts` :23–56 | `extrairAtribuicaoWaha` | ~35 linhas, MIT, resolve o problema exato de A1/A2, inclusive o filtro de post orgânico que ninguém lembra de fazer | É a ponte Meta Ads → WhatsApp que não temos |
| DeskcommCRM | `lib/agent-engine/agent/split-message.ts` :7–112 | `splitIntoBubbles` | Puro, testável, sem dependência de infra | B6 |
| WAHA / Baileys | — | biblioteca/serviço inteiro | São dependências, não código a copiar | B1 |

## 6.2 ADAPTAR CÓDIGO

| Repo | Arquivo/componente | Função | Motivo | Relação |
|---|---|---|---|---|
| DeskcommCRM | `lib/agent-engine/agent/lead-state.ts` :23–45 | `LEAD_STAGES`, `LEAD_STAGE_TRANSITIONS`, `isValidTransition` | A forma serve; os estágios não — o funil dele é B2B (BANT), o nosso é COD | H5 |
| DeskcommCRM | `lib/agent-engine/queue/queue.ts` :69–242 | `enqueueJob`, `claimJobs`, `completeJob` | Fila em tabela SQL, sem Redis — combina com a nossa spec de "tabela de jobs no SQLite" (`PROMPT.md` :253); precisa adaptação Postgres→SQLite | B1, F, G |
| DeskcommCRM | `lib/agent-engine/agent/tool-breaker.ts` :92–110 | `canonicalHash`, `wrapToolsWithBreaker` | Impede o agente de repetir a mesma chamada em laço | H4 |
| DeskcommCRM | `lib/agent-engine/pacing/engine.ts` :56–206 | `decidePacing`, `warmupCapFor`, `janelaDeEnvioAberta` | Só faz sentido se ficarmos em número não oficial | Anti-ban |

## 6.3 REUTILIZAR PADRÃO ARQUITETURAL

| Repo | Padrão | Onde ver | Motivo |
|---|---|---|---|
| DeskcommCRM | **Cadeia de verificações antes do envio, declarativa e versionada** | `guardrails/before-send.ts` :660–693 | Transforma nossas regras de prosa ("não prometer o que a operação não cumpre") em código que veta. **É o padrão mais valioso do conjunto para nós.** |
| DeskcommCRM | **Texto só sai por tool** | `inbound-turn.ts` :154–161 | Sem isso não existe ponto único onde verificar a mensagem |
| DeskcommCRM | **Erro instrutivo de volta ao modelo** | `lib/mcp/recusa-para-o-modelo.ts`; `BeforeSendResult` :702–715 | O modelo aprende no turno seguinte em vez de quebrar |
| DeskcommCRM | **Handoff por sentinela (regex, custo zero) + por tool** | `human-handoff.ts` :61, :252 | "Quero falar com humano" não deveria custar uma chamada de LLM |
| DeskcommCRM | **Follow-up agendado pelo próprio agente** | tool `schedule_followup` :177 + `applyScheduleFollowup` :77 | Uma promessa, um agendamento — evita régua cega |
| DeskcommCRM | **Teto de custo por conversa que vira handoff** | `inbound-turn.ts` :432 | Com margem de R$ 63,35, custo descontrolado come a venda |
| DeskcommCRM / WAHA | **Idempotência por chave única + violação tratada** | `ARCHITECTURE.md` §Event log; `dispatcher/index.ts` :314 | Webhook duplicado é regra, não exceção |
| Evolution | **Debounce de mensagens do usuário** | `base-chatbot.controller.ts` :23, :108 | B2 |
| Evolution | **Máquina de sessão com `paused`** | `base-chatbot.service.ts` :136–138 | Enquanto o humano atende, o bot cala |
| Chatwoot | **`bot_handoff!` como transição explícita de conversa** | `app/models/conversation.rb` :183–189 | Handoff é mudança de estado observável, não "parei de responder" |
| Mastra | **Processadores encadeáveis de entrada/saída** | `packages/core/src/processors/processors/` | Mesma ideia da cadeia do DeskcommCRM, com outra ergonomia |
| n8n | **Retry declarativo por passo** | `packages/workflow/src/interfaces.ts` :1663–1665 | `retryOnFail`/`maxTries`/`waitBetweenTries` como configuração, não `try/catch` espalhado |

## 6.4 REUTILIZAR CONCEITO

| Repo | Conceito | Por quê |
|---|---|---|
| mem0 | Extrair **fatos** em vez de guardar transcrição; reconciliar com ADD/UPDATE/DELETE/NONE (`prompts.py` :176–185) | Nos diz o que guardar. Não implica adotar o mem0 |
| Mastra | **Working memory** como bloco editável pelo agente (`memory/memory.ts` :384) | Alternativa mais simples que vector store para um bloco de fatos por lead |
| DeskcommCRM | Classificador barato antes do turno caro (`intent-classifier.ts` :90) | Economia direta de custo por conversa |
| DeskcommCRM | `current-state.md` como retrato datado que se declara não-mantido | Disciplina de documentação que combina com a nossa |
| Chatwoot | Campanha `ongoing` vs `one_off` (`campaign.rb` :50) | Duas naturezas de follow-up: régua contínua e disparo único |
| WAHA | Um transporte, várias engines atrás da mesma API | Reduz o custo de trocar de estratégia se o número for banido |

## 6.5 APENAS REFERÊNCIA

| Repo | O que | Por quê |
|---|---|---|
| DeskcommCRM | `docs/threat-model.md`, `ARCHITECTURE.md`, `docs/business-rules/` | Modelo de como documentar sem mentir |
| Evolution | `src/api/integrations/chatbot/*` | Mapa de como o mercado BR conecta bot ao WhatsApp |
| n8n | 9.000+ templates | Ver desenhos de fluxo antes de escrever o nosso |
| Chatwoot Captain | `enterprise/app/services/captain/tools/` | Como modelar tool HTTP definida pelo usuário — **código sob licença comercial, não copiar** |
| mem0 | `evaluation/` | Como medir memória, se um dia precisarmos |

## 6.6 NÃO UTILIZAR

| Repo | O que | Por quê |
|---|---|---|
| DeskcommCRM | Multi-tenancy, RLS, `fn_user_org_ids()`, 190 migrations, MFA/TOTP, kanban, Nuvemshop, instalador HostGator | Resolve o problema dele (CRM para várias empresas), não o nosso (um produto, um operador) |
| Chatwoot | O produto inteiro como base | Ruby on Rails + Sidekiq + Redis fora da nossa stack; Captain é enterprise |
| n8n | Como sede da lógica de negócio | Lógica em JSON visual colide com `CLAUDE.md` (TS strict, testes, revisão de diff) |
| mem0 | Stack de vector store + grafo | Nossos "fatos" são ~8 campos estruturados |
| Evolution | Bot engine embutido (`chatbot/openai`) | Compete com o nosso agente em vez de servi-lo |
| Mastra | `packages/ee/*` | Licença comercial |
| Todos | Qualquer código sob `enterprise/` ou `ee/` | Licença comercial — leitura sim, cópia não |

---

# 7. Lacunas

Formato: **O QUE FALTA → POR QUE É NECESSÁRIO → COMO OS REPOSITÓRIOS RESOLVEM → ALTERNATIVAS.**

1. **Transporte de WhatsApp com sessão persistente** → sem isso não há canal; hoje só temos links `wa.me` (`WhatsAppFloat.tsx` :4) → WAHA (4 engines, Docker), Evolution (Baileys + Cloud API), Baileys (biblioteca) → (a) WAHA em VPS; (b) Baileys embutido no nosso processo Node; (c) Cloud API oficial da Meta; (d) Evolution.
2. **Captura de `ctwa_clid` na entrada** → sem ela não sabemos qual anúncio gerou a conversa e o Meta não otimiza → DeskcommCRM `extrairAtribuicaoWaha` (`lib/waha/atribuicao-de-anuncio.ts` :23–56) → (a) adaptar as ~35 linhas; (b) escrever do zero a partir de `contextInfo.externalAdReplyInfo`; (c) usar Cloud API, onde o campo chega no webhook oficial.
3. **Parâmetro de rastreio no link da LP** → o botão flutuante e a página de obrigado mandam a cliente ao WhatsApp sem qualquer identificação; a conversa chega anônima → nenhum repositório resolve (é peculiaridade nossa) → (a) `wa.me/<num>?text=` com código curto; (b) link por pedido na página de obrigado; (c) aceitar anonimato e casar por telefone.
4. **Persistência (banco + schema)** → não existe nenhuma no projeto; `CLAUDE.md` declara SQLite + Drizzle mas não há código → todos os 8 têm; DeskcommCRM em Postgres, n8n suporta SQLite → (a) SQLite + Drizzle como já declarado; (b) Postgres/Supabase como DeskcommCRM.
5. **Fila de trabalho durável** → mensagem, follow-up e status de pedido são assíncronos; sem fila, um erro perde a mensagem → DeskcommCRM `queue/queue.ts` :69–242 (tabela SQL + claim); n8n modo fila (Redis); WAHA BullMQ → (a) tabela de jobs em SQLite (a nossa spec já pede, `PROMPT.md` :253); (b) BullMQ + Redis; (c) n8n externo.
6. **Debounce de mensagens picadas** → cliente manda "oi", "vi o anúncio", "quanto é?" em 4 segundos; sem agregação o agente responde três vezes → Evolution `debounceTime` (`base-chatbot.controller.ts` :23, :108) → (a) janela fixa de N segundos; (b) esperar parar de digitar; (c) responder à última e ignorar as anteriores.
7. **Máquina de estados do funil COD** → precisamos saber em que ponto cada conversa parou para retomar e para medir → DeskcommCRM `lead-state.ts` :23–45 com transições declaradas e regressão proibida → (a) enum + tabela de transições; (b) campo livre (rejeitado: vira lixo); (c) estágio inferido pelo LLM a cada turno (caro e instável).
8. **Guardrails executáveis de promessa** → nossa regra mais cara está escrita em prosa: não afirmar ausência de cobrança antecipada enquanto o checkout emitir PIX (`docs/agente-whatsapp.md` §Tom de voz). Prompt não é garantia → DeskcommCRM `BEFORE_SEND_GATES` :681–693, com `promiseGate` determinístico e `semanticPromiseGate`; Mastra `processors/processors/regex-filter.ts` → (a) cadeia de gates própria; (b) processadores do Mastra; (c) só prompt (não recomendado: é o erro que a operação já cometeu no site).
9. **Handoff humano** → pendência declarada em `docs/agente-whatsapp.md` §Ainda em aberto; sem isso agente e operador falam por cima um do outro → Chatwoot `bot_handoff!` (`conversation.rb` :183); DeskcommCRM sentinela + tool (`human-handoff.ts` :61, :252); Evolution `paused` (`base-chatbot.service.ts` :136) → (a) estado `pausado` na nossa tabela + notificação; (b) Chatwoot como caixa de entrada; (c) o operador responde pelo celular e o sistema detecta mensagem enviada por humano.
10. **Criação de pedido a partir da conversa** → sem isso o agente conversa e depois joga a cliente para o checkout, perdendo o ganho de conversão → **nenhuma das 8 referências cria pedido**; DeskcommCRM só lê (`comercio.ts` :27) → (a) API da Coinzz, se existir; (b) automação de navegador (Playwright já está na nossa stack declarada); (c) criar na Logzz; (d) mandar link de checkout pré-preenchido (mais simples, menos conversão).
11. **Status de pedido e entrega** → é o que alimenta véspera de entrega e reduz recusa na porta → nenhuma referência resolve para COD; DeskcommCRM lê pedidos de e-commerce → (a) webhook da Coinzz (já mapeado em `docs/agente-whatsapp.md`); (b) polling; (c) operador atualiza manualmente.
12. **Agendador de follow-up** → funções 2, 3 e 4 do agente dependem dele → DeskcommCRM `schedule_followup` :177 + gate por silêncio; n8n `Schedule Trigger`/`Wait`; Chatwoot `campaign.rb` :50–92 → (a) tabela de agendamentos + worker; (b) n8n externo; (c) cron simples.
13. **Base de conhecimento consumível** → as respostas certas existem, mas em JSX (`Objection.tsx` :10–13, `FAQ.tsx` :11–26) → Chatwoot Captain (documentos → embeddings), DeskcommCRM `lib/ai/rag/ingest/faq.ts` → (a) extrair para JSON/Markdown e injetar no prompt (com ~10 fatos, cabe); (b) RAG com embeddings; (c) duplicar no prompt (rejeitado: duas verdades divergem).
14. **Memória de fatos por lead** → tamanho, medo declarado, evento, endereço, histórico de pedido → mem0 (extração + reconciliação, `prompts.py` :176–185); Mastra working memory (:384); DeskcommCRM lead notes → (a) colunas estruturadas na tabela `leads`; (b) bloco de working memory; (c) mem0.
15. **Controle de custo de IA** → margem de R$ 63,35 por entrega paga; conversa longa pode consumir uma fração relevante → DeskcommCRM `lib/ai/runtime/cost.ts` + handoff ao estourar teto (:432); nossa spec já pede tabela `ai_calls` e pausa por orçamento (`PROMPT.md` :173) → (a) teto por conversa; (b) teto mensal; (c) modelo barato para classificar e caro só para redigir.
16. **Idempotência de webhook** → WhatsApp e Coinzz reentregam; sem chave, a cliente recebe duas mensagens ou o pedido duplica → DeskcommCRM `unique + 23505`; WAHA HMAC + retry → (a) `unique(external_id)`; (b) cache de ids recentes.
17. **Verificação de assinatura de webhook** → o endpoint fica exposto na internet → WAHA HMAC (`WebhookPlugin.sender.ts` :150–177); DeskcommCRM HMAC-SHA512 + `timingSafeEqual` (`lib/waha/ingest.ts` :256) → (a) HMAC; (b) token no path; (c) allowlist de IP.
18. **Pacing anti-banimento** → o número candidato é o mesmo do botão do site: banimento tira dois canais de uma vez → DeskcommCRM `pacing/engine.ts` :56–206 → (a) knobs de throttle/janela/aquecimento; (b) número separado para o agente; (c) Cloud API oficial, onde o problema vira janela de 24h e templates.
19. **Opt-out irrevogável** → exigência legal e de plataforma; DeskcommCRM põe `stopGate` como primeiro portão (:682) e nossa spec já prevê `do_not_contact` (`PROMPT.md` :171) → (a) primeiro gate da cadeia; (b) tabela de bloqueio consultada antes de cada envio.
20. **Recomendação de tamanho determinística** → é a decisão que mais gera troca e recusa; deixar o LLM adivinhar é risco → nenhuma referência tem isso → (a) tool com tabela de medidas; (b) regra "na dúvida, o maior" (já é a nossa política no `FAQ.tsx` :16–20); (c) perguntar duas medidas.
21. **Conversões do Meta a partir da conversa** → sem isso a campanha otimiza para conversa iniciada, não para venda → nenhuma referência resolve → (a) API de Conversões com `ctwa_clid`; (b) evento offline; (c) só métrica interna.
22. **Testes de conversa** → hoje há um único teste `expect(true).toBe(true)` (`colet/src/test/example.test.ts`) → Mastra `packages/evals`; DeskcommCRM `tests/unit/before-send-chain-shape.test.ts` → (a) casos de conversa gravados como fixtures; (b) evals com LLM juiz; (c) testes só dos gates determinísticos.
23. **Observabilidade da decisão do agente** → quando ele errar com uma cliente, precisamos saber por quê → DeskcommCRM `GateTraceEntry` :694 + `before_send_traces`; n8n histórico de execuções → (a) trace por turno em tabela; (b) log estruturado em arquivo.
24. **Manual do operador** → `CLAUDE.md` §Conventions exige manual em português; ele não existe → — → (a) escrever junto com o agente; (b) depois.

---

# 8. Decisões ainda não resolvidas

| # | DECISÃO | OPÇÕES ENCONTRADAS | VANTAGENS | DESVANTAGENS | IMPACTO |
|---|---|---|---|---|---|
| 1 | **Transporte de WhatsApp** | (a) WAHA; (b) Baileys embutido; (c) Evolution; (d) Cloud API oficial | (a) 4 engines, retry e HMAC prontos, manutenção viva (commit 2026-09-01); (b) zero serviço extra, casa com app Node local; (c) ecossistema BR e integrações prontas; (d) sem risco de ban, suporta anúncio CTWA nativamente | (a) exige Docker/VPS; (b) reimplementar sessão, mídia, reconexão, pacing; (c) `main` parado há ~4 meses; (d) custo por conversa, janela de 24h, templates aprovados, verificação de negócio — e **não temos CNPJ** (`docs/contexto-do-projeto.md` §3, decisão encerrada) | Define infraestrutura, risco de banimento e se a operação é legalizável. **A ausência de CNPJ provavelmente elimina (d)** — [HIPÓTESE] a confirmar |
| 2 | **Onde o agente roda** | (a) app Node local com SQLite (o que `CLAUDE.md` declara); (b) VPS 24/7; (c) serverless + Postgres gerenciado | (a) simples, barato, já decidido; (b) o WhatsApp precisa de sessão viva e follow-up precisa de relógio; (c) escala | (a) máquina desligada = agente morto e cliente sem resposta; (b) custo e operação; (c) `CLAUDE.md` proíbe explicitamente SQLite em serverless efêmero | **Conflito real entre o que está escrito no repositório e o que o canal exige.** É a primeira pergunta a resolver |
| 3 | **Runtime do agente** | (a) OpenAI SDK direto (o que `CLAUDE.md` declara); (b) Vercel AI SDK; (c) Mastra; (d) n8n | (a) menos dependência; (b) troca de provedor sem reescrever; (c) memória, workflows, suspend/resume e processadores prontos; (d) visual, rápido de prototipar | (a) reimplementar loop, tools, retry; (b) ainda escrevemos o loop; (c) framework opinativo com churn de versão; (d) lógica em JSON, difícil de testar e revisar | Define quanto código escrevemos e quanto herdamos |
| 4 | **Memória** | (a) colunas estruturadas; (b) working memory (bloco editável); (c) mem0 | (a) simples, consultável, barato; (b) flexível para o que não é campo; (c) extração e reconciliação prontas | (a) rígida para o inesperado; (b) precisa de disciplina de tamanho; (c) infra + custo de LLM por evento | Custo por conversa e qualidade da retomada |
| 5 | **Onde o pedido nasce** | (a) API da Coinzz; (b) automação de navegador; (c) link de checkout pré-preenchido; (d) Logzz direto | (a) limpo, se existir; (b) Playwright já está na stack declarada; (c) trivial; (d) mais perto da logística | (a) existência não verificada — **NÃO IDENTIFICADO**; (b) frágil, quebra com mudança de tela; (c) perde a conversão que o agente construiu; (d) desconhecido | Define se o agente **vende** ou só **encaminha** |
| 6 | **Número de telefone** | (a) o mesmo do site (`5511916616348`); (b) número novo | (a) já está no ar, contatos salvos; (b) isola risco de ban e permite aquecer | (a) ban derruba o canal de atendimento da LP junto; (b) começa do zero e novo número tem cap de aquecimento | Risco operacional direto |
| 7 | **Handoff** | (a) estado `pausado` próprio; (b) Chatwoot; (c) detectar resposta humana pelo celular | (a) simples; (b) caixa de entrada pronta, com atribuição e histórico; (c) zero mudança no hábito do operador | (a) o operador precisa de um lugar para ver; (b) Rails + Redis + Postgres para um operador; (c) detecção frágil | Define se o operador vive dentro ou fora do sistema |
| 8 | **Base de conhecimento** | (a) JSON/Markdown no prompt; (b) RAG com embeddings; (c) manter em JSX e duplicar | (a) simples e determinístico; (b) escala para muito conteúdo; (c) nenhuma | (a) cresce o prompt; (b) infra e custo desproporcionais a ~10 fatos; (c) duas verdades divergem | Custo por turno e manutenção do conteúdo |
| 9 | **Orquestração de follow-up** | (a) tabela + worker próprios; (b) n8n; (c) cron simples | (a) testável, versionado, dentro do repo; (b) rápido de montar e já temos MCP do n8n nesta sessão; (c) mínimo | (a) mais código; (b) lógica fora do Git; (c) sem retry nem observabilidade | Define onde mora a regra mais valiosa da operação (a confirmação pós-pedido) |
| 10 | **Escopo do primeiro corte** | (a) só função 3 (confirmação e acompanhamento pós-pedido); (b) só função 1 (atendimento pré-venda inbound); (c) as duas | (a) ataca o evento mais caro (recusa na porta) com o menor risco de conversa aberta; (b) é o que a campanha exige; (c) completo | (a) não atende a campanha nova; (b) deixa o dinheiro maior na mesa; (c) dobra o escopo do primeiro corte | Define o que é entregue primeiro |

---

# 9. Conclusão

## 9.1 Os 20 componentes mais importantes encontrados

| # | Componente | Onde |
|---|---|---|
| 1 | Cadeia `before_send` de 11 gates, versionada | DeskcommCRM `guardrails/before-send.ts` :660–693 |
| 2 | Extrator de atribuição de anúncio CTWA | DeskcommCRM `lib/waha/atribuicao-de-anuncio.ts` :23–56 |
| 3 | `AGENT_TOOL_DEFS` — 12 tools com validação estrita pós-SDK | DeskcommCRM `inbound-turn.ts` :148–308 |
| 4 | Máquina de estados de funil com regressão proibida | DeskcommCRM `lead-state.ts` :23–45 |
| 5 | Handoff por sentinela + por tool | DeskcommCRM `human-handoff.ts` :61, :117, :252 |
| 6 | `schedule_followup` — agendamento feito pelo próprio agente | DeskcommCRM `inbound-turn.ts` :177 + `schedule-followup.ts` :77 |
| 7 | Motor de pacing anti-banimento | DeskcommCRM `pacing/engine.ts` :56–206 |
| 8 | Fila em tabela SQL com claim | DeskcommCRM `queue/queue.ts` :69–242 |
| 9 | Circuit breaker de tools | DeskcommCRM `tool-breaker.ts` :92–110 |
| 10 | Compactação de contexto por orçamento | DeskcommCRM `compaction.ts` :113, :190 |
| 11 | Quebra de resposta em bolhas | DeskcommCRM `split-message.ts` :7, :99 |
| 12 | Webhook com HMAC e retry configurável | WAHA `WebhookPlugin.sender.ts` :150–204 |
| 13 | Abstração de 4 engines de WhatsApp | WAHA `src/core/engines/` |
| 14 | WhatsApp como servidor MCP | WAHA `src/apps/mcp/mcp.server.ts` :24 |
| 15 | `debounceTime` de mensagens do usuário | Evolution `base-chatbot.controller.ts` :23, :108 |
| 16 | Sessão com estado `paused` | Evolution `base-chatbot.service.ts` :136–153 |
| 17 | `MessageRetryManager` e `useMultiFileAuthState` | Baileys `message-retry-manager.ts` :65; `use-multi-file-auth-state.ts` :33 |
| 18 | Working memory em modo tool-call | Mastra `memory/memory.ts` :82–100, :384 |
| 19 | Extração e reconciliação de fatos | mem0 `prompts.py` :15, :176–185 |
| 20 | `bot_handoff!` como transição de conversa | Chatwoot `conversation.rb` :183–189 |

## 9.2 Os 10 padrões arquiteturais mais relevantes

1. Verificação determinística entre o modelo e o canal, em ordem fixa e versionada.
2. Saída do modelo apenas por tool — ponto único de inspeção.
3. Erro devolvido ao modelo como instrução, não como exceção.
4. Idempotência por chave única com a violação tratada como "já feito".
5. Fila durável em tabela do próprio banco, sem dependência nova.
6. Serialização por destinatário (advisory lock) para não estourar limites nem duplicar envio.
7. Classificador barato antes do turno caro.
8. Estado explícito com transições declaradas e regressão proibida.
9. Follow-up nascido de uma promessa concreta na conversa, não de régua cega.
10. Teto de custo que vira handoff em vez de degradação silenciosa.

## 9.3 As 10 funcionalidades indispensáveis para o nosso agente

1. Receber e responder no WhatsApp com sessão persistente.
2. Identificar a origem (anúncio, botão da LP, página de obrigado).
3. Agregar mensagens picadas antes de responder.
4. Recomendar tamanho de forma determinística.
5. Responder às 4 objeções já validadas, com o argumento certo.
6. Coletar e confirmar nome, endereço e forma de pagamento.
7. Registrar o pedido (ou, no mínimo, o intento com todos os dados).
8. Confirmar o pedido no mesmo dia e acompanhar até a entrega.
9. Passar para o humano quando pedido ou quando travar.
10. Nunca prometer o que a operação não cumpre — verificado em código, não no prompt.

## 9.4 As 10 funcionalidades secundárias

1. RAG com embeddings. 2. Memória semântica de longo prazo. 3. Recomendação por catálogo.
4. Carrinho. 5. Multi-tenancy. 6. Painel completo de CRM. 7. Multi-canal.
8. Evals automatizadas com LLM juiz. 9. Recompra e indicação. 10. A/B de copy do agente.

## 9.5 As 10 maiores lacunas atuais

1. Nenhum transporte de WhatsApp. 2. Nenhuma persistência. 3. Nenhuma fila/worker.
4. Nenhum estado de conversa. 5. Nenhum guardrail executável. 6. Nenhum handoff.
7. Nenhuma criação de pedido. 8. Nenhum acompanhamento de entrega. 9. Nenhum follow-up.
10. Conhecimento preso em JSX.

## 9.6 Os 10 elementos com maior potencial de acelerar o desenvolvimento

1. `extrairAtribuicaoWaha` (MIT, ~35 linhas, resolve A1/A2).
2. A forma da cadeia `before_send`.
3. `splitIntoBubbles`.
4. `LEAD_STAGE_TRANSITIONS` como formato.
5. `queue.ts` (enqueue/claim/complete) adaptado a SQLite.
6. `debounceTime` do Evolution como parâmetro já pensado.
7. WAHA como transporte pronto com HMAC e retry.
8. A copy da nossa própria LP como base de conhecimento.
9. `docs/PROMPT.md` §Arquitetura de software (:225–262) como esqueleto de pastas já decidido.
10. O MCP do n8n disponível nesta sessão para prototipar follow-up sem instalar nada.

## 9.7 Os 5 maiores riscos técnicos

1. **Banimento do número** — e o número candidato é o mesmo do atendimento da LP.
2. **Agente prometer o que a operação não cumpre** — o checkout ainda emite PIX imediato; a promessa quebrada já é causa conhecida de 2 em 3 PIX expirados (`docs/contexto-do-projeto.md` §4).
3. **Disponibilidade** — app local com SQLite não sustenta canal 24/7 nem relógio de follow-up.
4. **Custo de IA por conversa contra margem de R$ 63,35.**
5. **Erro de tamanho ou endereço virando recusa na porta** — o evento mais caro da operação.

## 9.8 As 5 decisões arquiteturais para depois

1. Transporte de WhatsApp (não oficial vs. Cloud API — atravessada pela ausência de CNPJ).
2. Onde o sistema roda e qual banco (o conflito entre `CLAUDE.md` e o canal).
3. Runtime do agente (SDK direto, AI SDK, Mastra ou n8n).
4. Onde o pedido nasce (API, navegador, link ou Logzz).
5. Escopo do primeiro corte (pré-venda inbound, pós-pedido, ou os dois).

---

*Fim da etapa de análise. Nada implementado. Nenhuma arquitetura escolhida.*
