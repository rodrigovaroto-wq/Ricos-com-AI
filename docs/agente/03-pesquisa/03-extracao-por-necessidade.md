# Revisão da análise — extração por necessidade, não por repositório

> Complementa [`02-analise-dos-8-repositorios.md`](02-analise-dos-8-repositorios.md).
> Nada implementado, nada escolhido.

## Correção de enquadramento

A primeira passagem organizou tudo **por repositório** e, na prática, tratou o DeskcommCRM
como espinha dorsal. Isso não era a tarefa. A tarefa é extrair peças de todos os 8 para
compor **o nosso** agente. Esta revisão reorganiza por necessidade nossa e vai atrás do que
os outros 7 têm de melhor — inclusive coisas que a primeira leitura não viu.

## Correções factuais à análise anterior

| Onde eu errei ou fui incompleto | Correção |
|---|---|
| n8n: handoff humano marcado `PARCIAL — só evidência documental` | **EXISTE em código.** `packages/nodes-base/utils/sendAndWait/utils.ts` → `getSendAndWaitProperties` :59, `sendAndWaitWebhook` :354, `getSendAndWaitConfig` :513; e o nó de WhatsApp implementa: `packages/nodes-base/nodes/WhatsApp/GenericFunctions.ts` :110–133 monta botões e pausa o fluxo até a resposta |
| "Nenhuma referência tem escolha estruturada (botões/listas)" — eu nem procurei | **Três têm.** WAHA `src/api/chatting.controller.ts` → `sendButtons` :209–219, `sendList` :222–231, `sendPoll` :293–299 (+ DTOs em `chatting.buttons.dto.ts` :33, `chatting.list.dto.ts`); n8n via `sendAndWait`; Chatwoot `app/models/message.rb` :89–103 (`content_type` com `input_select`, `cards`, `form`, `input_csat`) |
| Anti-ban resumido a "pacing" | Faltou o **spinning**: `deskcomm/lib/agent-engine/spinning/{defaults,engine,store}.ts` — gate contra *template idêntico em massa*, descrito no cabeçalho de `defaults.ts` :2–9 como "gatilho de ban confirmado" |
| Base de conhecimento tratada como "prompt ou RAG" | Existe um terceiro caminho, melhor para nós: **skills com matcher determinístico** — `deskcomm/lib/agent-engine/agent/skills.ts` :2–22 |
| n8n idempotência | Continua **NÃO IDENTIFICADO**: procurei um nó de deduplicação em `packages/nodes-base/nodes/RemoveDuplicates` e o caminho não existe nesta árvore. Não conclua que não existe — eu não achei |

---

# Catálogo de extração, por necessidade nossa

## N1 — Fazer a cliente escolher sem digitar

**Por que importa:** tamanho, forma de pagamento e confirmação de endereço são as três
respostas onde texto livre gera erro, e erro de tamanho vira troca ou recusa na porta.

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| WAHA | `sendButtons`, `sendList`, `sendPoll` | `src/api/chatting.controller.ts` :209, :222, :293 | P/M/G/GG/XGG como lista tocável em vez de texto livre |
| n8n | `sendAndWait` no WhatsApp | `packages/nodes-base/nodes/WhatsApp/GenericFunctions.ts` :110–133 | Manda a pergunta com botões e **suspende o fluxo** até a resposta chegar |
| Chatwoot | `content_type` de mensagem | `app/models/message.rb` :89–103 | Vocabulário de tipos: `input_select`, `cards`, `form`, `input_csat` |
| Mastra | `suspend()` em workflow | `packages/core/src/workflows/` (uso em `concurrent-resume.test.ts` :46) | Mesmo padrão de "pausa e espera", em TypeScript no nosso processo |

**[HIPÓTESE]** Botões e listas em WhatsApp não oficial têm suporte irregular e mudam com o
protocolo. A checar antes de contar com isso.

## N2 — Não duplicar contato nem mandar mensagem para o número errado

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| WAHA | App `brazilian-phone-numbers` | `src/apps/brazilian-phone-numbers/` — `utils/brPhone.ts` :13–14 (faixa de DDD 31–99), :24 `isBrazilCountryCode`, :70 `isBrazilPhone`, :82 `isBrazilLandline`, :93 `isBrazilMobile`, :121 `normalizeBrazilTollFreeDigits`, :131 `needsBrazilWhatsAppLookup`; cache com TTL em `storage/BrazilianPhoneCacheRepository.ts` | Resolve o **nono dígito**: o mesmo celular existe com e sem o 9, e o WhatsApp guarda um dos dois. Sem isso, a mesma cliente vira dois leads e a mensagem de confirmação vai para um JID que ela não lê |

Isso é infraestrutura brasileira que nenhuma das outras 7 referências tem, e nós vamos
receber 100% de números brasileiros. Foi a omissão mais custosa da primeira passagem.

## N3 — Responder objeção com o argumento certo, barato e testável

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| DeskcommCRM | Skills situacionais | `lib/agent-engine/agent/skills.ts` :2–22 | **Disclosure progressivo:** só `name + description` ficam no prefixo estável do prompt (cacheável); o **corpo** da skill entra apenas quando um matcher determinístico dispara, no sufixo por-lead. Situação neutra ⇒ zero corpos injetados |
| DeskcommCRM | Matcher determinístico | mesmo arquivo, :15–17 | "Mesmo sinal ⇒ mesmo conjunto de skills" — testável, sem LLM no matching |
| DeskcommCRM | Formato de pacote de skill | `lib/ai/skills/package.ts` :52–97 | `SKILL.md` com frontmatter de 4 chaves: `name`, `description`, `matcher.any_keywords`, `matcher.probe_keywords` |
| Mastra | `SkillSearchProcessor` | `packages/core/src/processors/processors/skill-search.ts` :1–20 | Alternativa: meta-tools `search_skills` / `load_skill` quando há skills demais para caber no prompt |

**Relação com o que já temos:** `Objection.tsx` :10–13 e `FAQ.tsx` :11–26 são 8 skills
prontas — golpe, ver antes de pagar, troca em 7 dias, atendimento humano, marcar por baixo
da roupa, errar o tamanho, como funciona a entrega, não emagrece. Falta o formato, não o
conteúdo.

## N4 — Não ser banido enviando a mesma mensagem para 300 pessoas

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| DeskcommCRM | Gate de spinning | `lib/agent-engine/spinning/engine.ts` :2–4 (decisão pura: candidata + janela das últimas N cópias do número + knobs → `allow` ou `veto` com razão) e `spinning/defaults.ts` :11–24 (`SpinningKnobs`, defaults conservadores, override por número em `channel_knobs.spinning_knobs`) | Impede que a sequência pós-pedido — que é a mesma mensagem para toda cliente — vire assinatura de robô |
| DeskcommCRM | Pacing | `lib/agent-engine/pacing/engine.ts` :56, :120, :201 | Janela de horário, throttle, aquecimento, teto diário |
| Evolution | Knobs de comportamento da instância | `src/api/dto/instance.dto.ts` :19–24 → `rejectCall`, `msgCall`, `groupsIgnore`, `alwaysOnline`, `readMessages`, `readStatus`; aplicados em `src/api/services/channel.service.ts` :149–152 | Um número de vendas que nunca lê mensagem, nunca fica online e atende ligação parece robô. Esses seis booleanos são a fachada humana do número |
| Baileys | Presença e digitando | `src/Socket/chats.ts` :809 `sendPresenceUpdate`, :843 (`composing`) | O sinal de "digitando" que o cliente espera ver |
| Baileys | Impressão digital do dispositivo | `src/Utils/browser-utils.ts` :19–26 `Browsers`; `src/Defaults/index.ts` :63 (`Browsers.macOS('Chrome')` como padrão) | O par navegador/SO anunciado na conexão. **[HIPÓTESE]** default de fábrica em milhares de bots pode ser sinal de detecção — a validar |

## N5 — Saber se o agente está vendendo ou queimando lead

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| Chatwoot | `Captain::ConversationOutcomeTracker` | `enterprise/app/services/captain/conversation_outcome_tracker.rb` → `record_eligibility` :4, `record_reopen` :10, `record_handoff(at:, reason_category:)` :29, `record_resolution` :36, `record_human_reply` :42, `record_csat` :55 | Modelo de **episódios**: cada conversa vira uma série de eventos com motivo, e daí sai a taxa de resolução sem humano, de handoff por motivo e de reabertura. É a métrica que responde "o agente ajuda?" ⚠️ diretório `enterprise/` — licença comercial, **ler sim, copiar não** |
| Chatwoot | CSAT | `app/models/csat_survey_response.rb` :28, `app/services/whatsapp/csat_template_service.rb` | Pesquisa de satisfação pelo próprio WhatsApp — encaixa no nosso G4 (perguntar se serviu) |
| DeskcommCRM | Trace por gate | `guardrails/before-send.ts` → `GateTraceEntry` :694–701 | Por que uma mensagem não saiu |
| DeskcommCRM | Custo por conversa | `lib/ai/runtime/cost.ts`; teto que vira handoff em `inbound-turn.ts` :432 | Custo de IA contra margem de R$ 63,35 |

## N6 — Acelerar o nosso próprio desenvolvimento

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| DeskcommCRM | Golden candidates | `lib/agent-engine/golden-candidates/*.json` — ex.: `skill-miss_objecao-preco_dcfd0c13....json` com `source: "skill_match_miss"`, `expected_skill`, `reason: "probe_matched_without_hard_match"`, `signal: "Oi! Vi o anuncio de voces. Quanto custa e como funciona a entrega?"`; e `stage-divergence_*.json` (8 arquivos) | Toda vez que o agente **quase** acerta, o runtime grava um arquivo para curadoria humana. É como o conjunto de testes de conversa nasce sozinho, do uso real, em vez de ser inventado |
| DeskcommCRM | Playbook em camadas | `lib/agent-engine/agent/playbook.ts` :17 (`'platform' \| 'tenant' \| 'campaign'`), :23 (`MAX_PLAYBOOK_LAYER_LINES = 200`), :47 `validatePlaybookLayerContent`; conteúdo-semente em `lib/agent-engine/playbooks/platform.md` | Instrução do agente separada em camadas versionadas, com teto de tamanho. E a regra de ouro escrita no topo do `platform.md`: *"Regras duras (janela de envio, STOP, throttle, validação de promessa) NÃO vivem aqui: são hooks determinísticos com poder de veto — este texto apenas orienta o tom"* |
| DeskcommCRM | Divergência de estágio | `agent/stage-classifier.ts` → `recordStageDivergenceCandidate` :150 | Quando o classificador e o agente discordam do estágio, vira candidato de curadoria |
| Mastra | Scorers | `packages/evals/src/scorers/{code,llm,prebuilt}` | Avaliação de resposta por código e por LLM juiz |
| Mastra | `response-cache` | `packages/core/src/processors/processors/response-cache.ts` :1–12 (hash estável do prompt) | Pergunta repetida não paga duas vezes |
| Mastra | Objetivo + scorer do agente | `packages/core/src/agent/goal/{objective.ts,scorer.ts}` | Agente com objetivo declarado e pontuação — encaixa em "conduzir até a venda" |
| mem0 | Esquema de histórico em SQLite | `mem0/memory/storage.py` :11 `SQLiteManager`, :105–125 tabela `history(id, memory_id, old_memory, new_memory, event, created_at, actor_id, role)` | **Nosso banco declarado é SQLite.** Esse esquema é um log auditável de memória: o que mudou, de quê para quê, por qual evento |
| Evolution | Debounce | `src/api/integrations/chatbot/base-chatbot.controller.ts` :23, :108 | Parâmetro já pensado para mensagem picada |
| n8n | `sendAndWait` | `packages/nodes-base/utils/sendAndWait/utils.ts` :59, :354, :513 | Padrão de pausa-e-espera com webhook de retomada |

## N7 — Janela de 24h e templates (só se formos para a API oficial)

| Repo | Peça | Localização | O que dá |
|---|---|---|---|
| Chatwoot | Templates sincronizados do provedor | `app/models/channel/whatsapp.rb` :7–8 (`message_templates`, `message_templates_last_updated`), :41 `after_create :sync_templates`, :134–135 `delegate :send_template, :sync_templates` | Como se guarda e sincroniza template aprovado pela Meta |
| DeskcommCRM | Gate de janela de atendimento | `guardrails/before-send.ts` → `messagingWindowGate` (posição 4 de `BEFORE_SEND_GATES` :685); `RunBeforeSendArgs.isTemplate` :720–724 | A cadeia sabe distinguir mensagem livre de template e só o gate de janela consulta isso |
| n8n | Trigger oficial | `packages/nodes-base/nodes/WhatsApp/WhatsAppTrigger.node.ts` :53–80 | Assinatura de webhook da Meta feita pelo próprio nó |

## N8 — Peças de canal que valem independente da rota escolhida

| Repo | Peça | Localização |
|---|---|---|
| WAHA | Retry de webhook com política (constante/exponencial) + HMAC | `src/modules/waha-webhook/WebhookPlugin.sender.ts` :36, :150–204 |
| WAHA | Uma API, quatro engines | `src/core/engines/{webjs,noweb,gows,wpp}` |
| Baileys | Persistência de sessão em arquivos | `src/Utils/use-multi-file-auth-state.ts` :33 |
| Baileys | Retry de mensagem no protocolo | `src/Utils/message-retry-manager.ts` :65, :114, :218 |
| Baileys | Buffer de eventos | `src/Utils/event-buffer.ts` :73 |
| Evolution | Sessão com estado `paused` (humano assumiu ⇒ bot cala) | `src/api/integrations/chatbot/base-chatbot.service.ts` :136–138 |
| Evolution | Encerramento por palavra-chave | mesmo arquivo :140–153 |

---

# O que cada repositório passa a contribuir, depois da revisão

| Repo | Contribuição principal | Contribuições secundárias | Descartado |
|---|---|---|---|
| **DeskcommCRM** | Padrões do motor: cadeia de veto, skills com matcher, spinning, pacing, golden candidates, playbook em camadas | Atribuição CTWA, fila SQL, tool-breaker, bolhas, compactação, custo→handoff | Multi-tenancy, RLS, 190 migrations, Nuvemshop, kanban, MFA |
| **WAHA** | Transporte + **números brasileiros** + mensagens interativas | Retry e HMAC de webhook, engines intercambiáveis, MCP | Chatwoot app, MongoDB |
| **Evolution** | Knobs de fachada humana do número + debounce + estado `paused` | Migração para API oficial pelo mesmo contrato | Bot engine embutido, filas industriais |
| **Baileys** | Sessão, retry e presença no nível do protocolo | Impressão digital de dispositivo | Nada mais — é biblioteca |
| **n8n** | `sendAndWait` (pausa-e-espera) + agendamento como primitiva | Retry declarativo por passo, modo fila | Ser a sede da lógica |
| **Mastra** | Processadores encadeáveis + scorers + response-cache | `suspend/resume`, working memory, skill-search, goal | `ee/` |
| **mem0** | Esquema de histórico de memória em SQLite | Extração e reconciliação de fatos (ADD/UPDATE/DELETE/NONE) | Vector store + grafo |
| **Chatwoot** | Modelo de medição de resultado (episódios) + CSAT | `bot_handoff!`, campanhas, templates, tipos de mensagem | O produto todo (Ruby); `enterprise/` é só leitura |

---

# Cobertura: o que ainda NÃO foi lido

Para não repetir o erro de apresentar leitura parcial como completa:

- **Mastra** — li `agent/`, `memory/`, `workflows/` (parcial), `processors/`, `rag/`, `evals/` (índice). **Não li:** `deployer`, `cli`, `auth`, `observability`, `agent-builder`, `di`, `channels`.
- **n8n** — li `nodes-langchain/{agents,memory,tools}`, `nodes/WhatsApp`, `cli/scaling`, `workflow/interfaces`, `utils/sendAndWait`. **Não li:** editor, execução, expressões, credenciais, os outros ~1.500 nós.
- **Chatwoot** — li modelos centrais e `enterprise/app/{models,services}/captain` por listagem. **Não li:** controllers, jobs, frontend Vue, `app/services/whatsapp/*` além dos nomes de arquivo.
- **mem0** — li `memory/main.py` (assinaturas), `configs/prompts.py`, `memory/storage.py`. **Não li:** `mem0-ts` a fundo, `server/`, `integrations/`, grafos.
- **Evolution** — li `integrations/{chatbot,event,channel}` e `dto/instance.dto.ts`. **Não li:** `whatsapp.baileys.service.ts` (o coração do canal), cache, filas internas.
- **Baileys** — li `Utils/` e assinaturas de `Socket/`. **Não li:** `Signal/`, `WABinary/`, envio de mídia.
- **WAHA** — li `api/`, `modules/waha-webhook`, `apps/`. **Não li:** engines por dentro, `core/media`, dashboard.
- **DeskcommCRM** — li `lib/agent-engine/**` (majoritariamente por cabeçalho e assinatura), `lib/waha/`, `lib/mcp/tools/` (nomes), docs. **Não li:** os 230 route handlers, as 190 migrations, `app/`, `workers/` por dentro.

Nada disso invalida o que está afirmado — só delimita onde a afirmação vale.
