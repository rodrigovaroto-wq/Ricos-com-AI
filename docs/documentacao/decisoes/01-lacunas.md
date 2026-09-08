# Lacunas

Tudo que o agente descrito em [`../../agente-ia/02-especificacao/`](../../agente-ia/02-especificacao/) precisa e que
hoje **não existe** no projeto. Formato:
**o que falta → por que é necessário → como os repositórios resolvem → alternativas.**

> **Atualizado após a rodada 1 de decisões** (2026-09-04). Estas continuam sendo lacunas —
> nada foi implementado — mas várias deixaram de ser escolha em aberto e viraram tarefa com
> rota definida. As decisões estão em [`03-decisoes-tomadas.md`](03-decisoes-tomadas.md).
>
> | Lacuna | O que a rodada 1 resolveu |
> |---|---|
> | 1. Transporte | Rota definida: **WAHA** |
> | 2. Nono dígito | Vem junto com o WAHA, via app `brazilian-phone-numbers` |
> | 6. Identificador nos links da LP | Continua em aberto |
> | 9/10. Persistência e fila | **SQLite numa VPS 24/7** — a proibição de serverless segue valendo |
> | 17. Recomendação de tamanho | **Tabela enviada à cliente; o maior em caso de dúvida** |
> | 26. Criação de pedido | **COD sem checkout; antecipado por link pré-preenchido.** Pendente: a Coinzz tem API? |
> | 28. Agendador de follow-up | Cadência definida: **30 min · dia seguinte · 3 dias com cupom** |
> | 25. Handoff | **Para e notifica; operador assume, exceto de madrugada** |
> | Exclusão geográfica | **Resolvida fora do escopo** — Coinzz/Logzz bloqueiam pedido COD sem cobertura |

Estado do código hoje, medido: `ricos-com-ai` não tem **nenhum** arquivo de código
(`find` por `*.ts`, `*.tsx`, `package.json` retorna vazio). `colet-cinta-modeladora` é uma
SPA Vite + React sem backend, sem banco e sem CI.

## Canal

1. **Transporte de WhatsApp com sessão persistente** → sem isso não há canal; hoje só
   temos links `wa.me` → WAHA (4 engines), Evolution (Baileys + Cloud API), Baileys
   (biblioteca) → (a) WAHA em VPS; (b) Baileys embutido no processo Node; (c) Cloud API
   oficial; (d) Evolution.
2. **Normalização de número brasileiro** → o mesmo celular existe com e sem o nono dígito
   e o WhatsApp guarda um dos dois; sem tratar, a mesma cliente vira dois leads e a
   confirmação vai para um JID que ela não lê → WAHA →
   `src/apps/brazilian-phone-numbers/utils/brPhone.ts` :13–131 → (a) adaptar; (b) usar
   WAHA com o app ligado; (c) escrever a regra de DDD e nono dígito.
3. **Validação de existência do número antes de enviar** → evita gravar lead e gastar
   turno com número sem WhatsApp → Evolution → `whatsapp.baileys.service.ts` :2295.
4. **Verificação de assinatura de webhook** → o endpoint fica exposto na internet → WAHA →
   `WebhookPlugin.sender.ts` :150–177; DeskcommCRM → `lib/waha/ingest.ts` :256
   (HMAC-SHA512 + `timingSafeEqual`) → (a) HMAC; (b) token no path; (c) allowlist de IP.

## Atribuição e medição

5. **Captura de `ctwa_clid` na entrada** → sem ela não sabemos qual anúncio gerou a
   conversa e o Meta não otimiza → DeskcommCRM → `lib/waha/atribuicao-de-anuncio.ts`
   :23–56 → (a) adaptar as ~35 linhas; (b) escrever do zero; (c) Cloud API, onde o campo
   vem no webhook oficial.
6. **Identificador nos links da LP** → botão flutuante e página de obrigado mandam a
   cliente ao WhatsApp sem qualquer identificação → nenhuma referência resolve, é
   peculiaridade nossa → (a) `wa.me/<num>?text=` com código curto; (b) link por pedido na
   página de obrigado; (c) aceitar anonimato e casar por telefone.
7. **Conversões de volta para o Meta** → sem isso a campanha otimiza para conversa
   iniciada → `facebook-nodejs-business-sdk` (oficial, mantido — último commit 2026-08-25)
   → `UserData.setCtwaClid()` (`src/objects/serverside/user-data.js` :1168–1185, valor não
   hasheado) + `ServerEvent.setActionSource('business_messaging').setMessagingChannel('whatsapp')`
   (`server-event.js` :211–223, :462–485 — valores confirmados na doc oficial
   "Conversions API for Business Messaging") + `AttributionData` para carimbar
   ad/adset/campaign no evento (`attribution-data.js`, arquivo inteiro) — ver
   [`../../campanhas-e-anuncios/02-analise-meta-ads-e-conversoes.md`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-/blob/main/docs/02-analise-meta-ads-e-conversoes.md)
   → (a) instalar o SDK oficial e montar o evento a partir do `ctwa_clid` já extraído pela
   lacuna 5; (b) evento offline; (c) só métrica interna.
8. **Métrica de desempenho do próprio agente** → saber se ele vende ou queima lead →
   Chatwoot → `enterprise/app/services/captain/conversation_outcome_tracker.rb` :4–55
   (episódios: elegibilidade, reabertura, handoff com motivo, resolução, resposta humana,
   CSAT) — ⚠️ diretório sob licença comercial, **ler não é copiar**.

## Infraestrutura

9. **Persistência** → não existe nenhuma; `CLAUDE.md` declara SQLite + Drizzle sem código →
   todos os 8 têm → (a) SQLite + Drizzle como já declarado; (b) Postgres.
10. **Fila de trabalho durável** → mensagem, follow-up e status de pedido são assíncronos →
    DeskcommCRM → `queue/queue.ts` :69–242 (tabela SQL + claim); n8n (modo fila com Redis);
    WAHA (BullMQ) → (a) tabela de jobs em SQLite, convenção herdada (ver
    [`../03-padroes-de-engenharia.md`](../03-padroes-de-engenharia.md)); (b) BullMQ +
    Redis; (c) n8n externo.
11. **Idempotência de webhook** → WhatsApp e Coinzz reentregam; sem chave, a cliente recebe
    duas mensagens ou o pedido duplica → DeskcommCRM → chave única + tratamento de `23505`
    → (a) `unique(external_id)`; (b) cache de ids recentes.
12. **Serialização por número** → dois workers no mesmo contato estouram o teto e mandam
    mensagem duplicada → DeskcommCRM → `before-send.ts` :28–36
    (`pg_advisory_xact_lock`) → (a) lock por contato; (b) fila com uma partição por número.

## Conversa

13. **Debounce de mensagens picadas** → "oi", "vi o anúncio", "quanto é?" em 4 segundos;
    sem agregação o agente responde três vezes → Evolution →
    `base-chatbot.controller.ts` :23, :108 → (a) janela fixa; (b) esperar parar de digitar;
    (c) responder à última.
14. **Transcrição de áudio** → nosso público manda áudio; sem isso o agente fica cego →
    DeskcommCRM → `lib/messaging/media/transcription.ts` (Whisper plugável) e
    `derivable.ts` :2–19 (lista única compartilhada por quem deriva e quem espera) →
    (a) Whisper; (b) modelo multimodal que aceita áudio; (c) responder pedindo texto
    (rejeitado: atrito com quem já está desconfiada).
15. **Quebra de resposta em bolhas e ritmo humano** → DeskcommCRM → `split-message.ts`
    :7, :99; Evolution → `whatsapp.baileys.service.ts` :2306–2330 (digitação fatiada em
    blocos de 20 s porque a presença expira).
16. **Máquina de estados do funil COD** → ver
    [`../../agente-ia/02-especificacao/03-maquina-de-estados.md`](../../agente-ia/02-especificacao/03-maquina-de-estados.md)
    → DeskcommCRM → `lead-state.ts` :23–45 → (a) enum + tabela de transições;
    (b) campo livre (rejeitado); (c) estágio inferido pelo LLM a cada turno (caro e instável).
17. **Recomendação de tamanho determinística** → é a decisão que mais gera troca e recusa →
    **nenhuma referência tem** → (a) função sobre a tabela de medidas; (b) regra "na dúvida,
    o maior", que já é a política publicada; (c) perguntar duas medidas.
18. **Extração estruturada de endereço** → texto livre vira campos → n8n →
    `InformationExtractor` e `OutputParserAutofixing` → (a) tool com schema + validação de
    CEP; (b) formulário por botões; (c) link externo (rejeitado: perde a conversa).

## Regra e segurança

19. **Guardrails executáveis** → nossa regra mais cara está escrita em prosa → DeskcommCRM →
    `before-send.ts` :681–693; Mastra → `processors/processors/` → (a) cadeia própria;
    (b) processadores do Mastra; (c) só prompt (rejeitado: é o erro que a operação já
    cometeu).
20. **Detecção de opt-out em português, com dois níveis** → "para" e "sai" são vocabulário
    normal de venda → DeskcommCRM → `lib/opt-out/deteccao.ts` :319, :332 → (a) adaptar;
    (b) escrever do zero (o arquivo documenta os erros que se comete escrevendo do zero).
21. **Pacing anti-banimento** → o número candidato é o mesmo do atendimento da LP →
    DeskcommCRM → `pacing/engine.ts` :56–206 → (a) knobs de janela/throttle/aquecimento;
    (b) número separado; (c) Cloud API.
22. **Variação de mensagem em massa** → a sequência pós-pedido é a mesma mensagem para
    centenas → DeskcommCRM → `reentry-template.ts` :2–11 (N variantes, escolha por
    `hash(lead_id) % n`, **custo zero**) → (a) variantes determinísticas; (b) reescrever com
    LLM (caro); (c) aceitar o risco (rejeitado).
23. **Teto de custo por conversa** → margem de R$ 63,35 → DeskcommCRM →
    `run-model-call.ts` :2–16 (orçamento conferido antes da chamada) e `inbound-turn.ts`
    :432 (teto vira handoff) → (a) teto por conversa; (b) teto mensal; (c) modelo barato
    para classificar, bom para redigir.
24. **Cache de prompt** → DeskcommCRM → `stable-prefix.ts` :29–45 (breakpoint no fim do
    prefixo estável, tools ordenadas por nome) → (a) prefixo estável desenhado desde o
    início; (b) ignorar e pagar a mais.

## Operação

25. **Handoff humano** → pendência declarada pelo operador; sem isso agente e operador
    falam por cima um do outro → Chatwoot → `conversation.rb` :183 (`bot_handoff!`);
    DeskcommCRM → `human-handoff.ts` :61, :252; Evolution → estado `paused`
    (`base-chatbot.service.ts` :136) → (a) estado `pausado` próprio + notificação;
    (b) Chatwoot como caixa de entrada; (c) detectar resposta humana pelo celular.
26. **Criação de pedido** → sem isso o agente conversa e joga a cliente para o checkout,
    perdendo a conversão que construiu → **nenhuma das 8 cria pedido**; existe objeto de
    pedido nativo do WhatsApp (Baileys → `business.ts` :254; Evolution → botão PIX com
    `order` embutido, `whatsapp.baileys.service.ts` :3258–3295) → (a) API da Coinzz, se
    existir; (b) automação de navegador (Playwright já está na stack declarada);
    (c) pedido nativo do WhatsApp **[HIPÓTESE]**; (d) link de checkout pré-preenchido.
27. **Status de pedido e entrega** → alimenta o aviso de véspera, que é a alavanca contra a
    recusa → nenhuma referência resolve para COD → (a) webhook da Coinzz; (b) polling;
    (c) operador atualiza à mão.
28. **Agendador de follow-up** → funções 2, 3 e 4 dependem dele → DeskcommCRM →
    `schedule_followup` :177 + gate por silêncio; n8n → `Schedule Trigger` / `Wait`;
    Chatwoot → `campaign.rb` :50–92 → (a) tabela + worker; (b) n8n; (c) cron simples.
29. **Frases de falha úteis** → quando quebra, o operador precisa saber o que fazer →
    DeskcommCRM → `lib/channels/frases-de-falha.ts` :17–43.
30. **Testes de conversa** → hoje há um único teste `expect(true).toBe(true)`
    (`colet/src/test/example.test.ts`) → DeskcommCRM → `golden-candidates/*.json` (o
    near-miss vira caso de curadoria automaticamente); Mastra → `packages/evals/src/scorers`
    → (a) fixtures a partir do uso real; (b) evals com LLM juiz; (c) testar só os gates
    determinísticos.
31. **Manual do operador em português** → exigido por `CLAUDE.md` §Conventions; não existe.
