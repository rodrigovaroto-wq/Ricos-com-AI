# Execução do mês 1 — o que construir antes do primeiro anúncio (2026-10-02)

> Plano dos itens 3 a 8 do quadro "o que falta antes do primeiro anúncio", definido com o
> operador em 2026-10-02. As decisões de negócio estão no L3 de
> [`09-pipeline-ate-producao.md`](09-pipeline-ate-producao.md); este arquivo diz **como** cada
> uma vira código, config ou workflow, com o arquivo exato e a prova de pronto.
>
> Regras de sempre (`CLAUDE.md`): todo `src/agent/X.ts` mudado muda também o espelho
> `supabase/functions/turn/X.ts`; gate, régua e banco vão para revisão Opus; toda mudança entra no
> [grafo de decisões](../../documentacao/decisoes/04-grafo-de-decisoes.md); validação local =
> `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm dev:conversas &&
> pnpm dev:gates && pnpm typecheck:function`.

## Ordem e dependências

| # | Item | Depende de | Quem | Tamanho |
|---|---|---|---|---|
| 3 | `askMarketingOptIn: true` no `BUSINESS_CONFIG` | nada (0019 já aplicada) | **O** | 5 min |
| 4a | Régua: `silence_3` a 63–71 h da entrada; `silence_2` dentro de 24 h | nada | C | ~1 dia, com revisão |
| 4b | Primeira resposta da agente em **1 minuto** (era 3 na doc, 2 no código) | nada | C | ~1 h |
| 5 | Versão da Malu gravada em cada turno | nada | C (+ **O** aplica a migração) | ~½ dia |
| 6 | Rotina "Hermes – decisão" + e-mails novos no n8n | 5 (o e-mail cita a versão) | C (+ **O** autoriza a Rotina) | ~½ dia |
| 7 | Conta de lucro por venda com o custo real | nada | C | ~1 h |
| 8 | Portal no Vercel | 5 (separa versões), métricas por criativo/região a definir | C (+ **O**/S credenciais) | 2–3 dias |
| — | ~~Reverificar API de cancelamento/devolução~~ — fechado em 02/10: não existe (ver fim) | — | — | — |

4a, 4b, 5 e 7 têm arquivos disjuntos e podem ir em paralelo (regra de ondas). 6 vem depois de 5.

---

## 3. `askMarketingOptIn` no `BUSINESS_CONFIG` — **operador**

**Onde:** painel da Supabase → projeto `hbmkgakzrqmdlsvszjeo` → **Edge Functions** → **Secrets**
(Project Settings → Edge Functions → Secrets) → linha **`BUSINESS_CONFIG`** → editar o valor.

**O que inserir — exatamente:**

- **Se o JSON ainda não tem a chave `"channel"`:** antes da última `}` do JSON, acrescente uma
  vírgula depois do último valor e cole:

  ```json
  "channel": { "askMarketingOptIn": true }
  ```

  Exemplo do final do JSON depois da edição:

  ```json
    "exchange": { ... },
    "channel": { "askMarketingOptIn": true }
  }
  ```

- **Se já existe `"channel": { ... }`:** dentro das chaves dele, acrescente
  `"askMarketingOptIn": true` (com vírgula separando do campo vizinho).

**Por quê:** a função lê `CONFIG.channel?.askMarketingOptIn === true`
(`supabase/functions/turn/index.ts:358`). Ausente = a pergunta "Quero ofertas" nunca sai e o
`silence_3` nunca vai como template.

**Pronto quando:** o JSON salvo é válido (cole em qualquer validador antes de salvar) e, depois
do próximo deploy da `turn` (o valor é lido quando a função sobe), uma conversa de teste que fica
em silêncio recebe o `silence_1` e, logo depois, a pergunta com os dois botões.

---

## 4a. Régua de silêncio dentro da janela gratuita — código

**Decisão (L3 item 5):** `silence_3` entre **63 h e 71 h depois da entrada dela pelo anúncio**
(a primeira mensagem de cada entrada; a mensagem automática da camada 1 sai na hora e abre a
*free entry point window* de 72 h), no **último horário dentro de 06:00–00:00** da faixa;
`silence_2` sempre **dentro de 24 h da última mensagem dela** (texto livre, sem template); se a
faixa 63–71 h já passou (ou cai antes do `silence_2`), **não há `silence_3`** e o `silence_2`
fecha a régua e marca `perdido`.

**Arquivos:** `src/agent/followups.ts` + espelho `supabase/functions/turn/followups.ts`;
`supabase/functions/turn/index.ts` (`scheduleSilenceTouches`, a varredura e o `leave`);
`tests/followups.test.ts`, `tests/order-stage.test.ts`; `src/dev/verify-guards.ts` (mutação nova);
`docs/agente-ia/06-script/03-templates-meta.md` (o `silence_2` deixa de ser template).

**Como:**

1. **Âncora.** A entrada é `conversations.created_at` da conversa (a conversa nasce na primeira
   mensagem; a camada 1 responde na hora). Uma entrada nova por anúncio = conversa nova? **Conferir
   primeiro** como a `turn` decide abrir conversa nova (se reaproveita a conversa do lead, a âncora
   passa a ser a primeira mensagem com `referral` de CTWA no payload da Meta — o webhook de entrada
   traz `referral` quando a mensagem vem de anúncio). Escolher pela leitura do código, não por
   suposição; registrar no grafo.
2. **`silence3At(entry)`** em `followups.ts` (zero imports, espelho byte a byte): candidato =
   `entry + 71 h`; se a hora local de São Paulo cai em 00:00–05:59, recua para **23:30 local do
   dia anterior** (sempre ≥ 63 h, porque a faixa proibida tem 6 h e a margem é 8 h). Usar
   `offsetMinutes`/`BUSINESS_TZ` que já existem.
3. **`silence_2`** = o menor entre "09:00 do dia seguinte" e "última mensagem dela + 23 h",
   ajustado para dentro de 06:00–00:00 **sem passar de 24 h** (se 09:00 passa das 24 h, o último
   horário de atendimento antes delas).
4. **`scheduleSilence(now, stopPoint, entry?)`** e `rulerFor(...)` recebem a âncora; sem âncora,
   comportamento antigo (os chamadores de `src/dev/*` não mudam). `silence_3` só entra se
   `silence3At(entry) > silence_2.runAt` e `> now`.
5. **Fim da régua.** `endsSilenceRuler(kind)` passa a considerar o último toque **da régua
   agendada**: quando não há `silence_3`, o `silence_2` é quem marca `perdido`. Fazer pelo dado
   (a varredura confere se resta `silence_3` agendado para a conversa), não por um segundo nome.
6. **Adiamento pelo relógio.** O `silence_3` já cai dentro de 06:00–00:00 por construção; o
   `restartRuler` que reancora a régua **não pode empurrar o `silence_3` para além de 71 h** —
   recalcular pela âncora, nunca por `from + 3 dias`.
7. **Testes (TDD):** entrada às 00:10, 05:50, 06:00, 12:00, 23:50 → `silence_3` sempre em
   [63 h, 71 h] e em 06:00–00:00; conversa que durou 65 h → sem `silence_3` e `silence_2` marca
   `perdido`; `silence_2` nunca > 24 h da última mensagem; última mensagem às 08:00 → `silence_2`
   antes das 08:00 do dia seguinte. Mutação em `verify-guards.ts` que volta `silence_3` para
   `3 * DAY` tem de ficar vermelha.

**Pronto quando:** validação local verde, revisão Opus "aprovado com resíduos", grafo §49
atualizado, `turn` publicada (deploy pela API, memória `supabase-deploy-por-api`) e sonda pela
porta de produção mostrando `followups.run_at` do `silence_3` dentro da faixa.

## 4b. Primeira resposta em 1 minuto — código

**Hoje:** a doc (R4.4) diz 3 min, `FIRST_REPLY_DELAY_MS = 3 * 60_000` em `src/agent/pacing.ts:13`,
mas o que roda é `WELCOME_RESUME_DELAY_SECONDS = 120` (`src/agent/retry.ts:319`, espelhado em
`supabase/functions/turn/retry.ts`), que o n8n usa no Wait do Turno (`?? 120`).

**Mudar:** `WELCOME_RESUME_DELAY_SECONDS = 60`; `FIRST_REPLY_DELAY_MS = 60_000`; o fallback do Wait
em `n8n/workflows/turno-da-agente.json` (`$json.resumeInSeconds ?? 120` → `?? 60`) publicado pela
API e conferido com `pnpm dev:n8n`; testes que fixam 120 (`tests/human-handoff.test.ts:223`,
`tests/persona-run.test.ts`) e 3 min (`tests/pacing.test.ts:37`); R4.4 e `01-mapa-funcional.md`
passam a dizer 1 minuto (decisão nova R18.x).

---

## 5. Versão da Malu em cada turno — código + migração

**Por quê:** sem ela, nem o Hermes nem o portal separam antes de depois de uma mudança (L3 item 8).

**Desenho mínimo:**

1. **Migração `0021_agent_version.sql`:** tabela `agent_versions (version int primary key,
   git_sha text not null, published_at timestamptz not null default now(), hermes_proposal_id
   uuid null references hermes_proposals(id), note text)`; coluna `agent_version int null` em
   `turn_outcomes` e `llm_calls`. Aplicada pelo **operador** (o deploy recusa migração).
2. **A `turn` lê `Deno.env.get("AGENT_VERSION")`** uma vez no topo e grava em cada
   `turn_outcomes` e `llm_calls`. Ausente → `null` (nunca inventa).
3. **Quem incrementa:** o deploy. `deploy-hermes.yml` (proposta aprovada) e o deploy manual pela
   API inserem a linha em `agent_versions` (`max+1`, sha do commit, proposta se houver) e gravam o
   segredo `AGENT_VERSION` **antes** de publicar a `turn`. Mesma regra no `supabase-deploy-por-api`.
4. **Views:** `eval_turn_outcomes` e `eval_conversation_cost` ganham agrupamento por versão; o
   pacote do Hermes (`hermes-core.ts`) leva os números por versão e a última proposta publicada.

**Pronto quando:** dois deploys seguidos geram v1 e v2; uma sonda em cada um grava a versão certa
em `turn_outcomes`; `pnpm hermes --source=supabase` mostra os números separados.

---

## 6. Rotina "Hermes – decisão" + e-mails — n8n + Claude Code

**Hoje (R14.14):** o workflow n8n "Hermes — decisão" (`n8n/workflows/hermes-decisao.json`) manda a
cada 15 min um e-mail com **um link por proposta** para um formulário que grava a decisão.

**Passa a ser:**

1. **E-mails:** "Monta o e-mail" e "Monta o resultado" geram o HTML de
   [`hermes/EMAILS.md`](../../../hermes/EMAILS.md) — texto exato, negrito e itálico, uma linha por
   anomalia `[01]`, `[02]`…, sem dado de cliente e **sem link de aprovação**. `{{ versão_atual }}`
   vem de `agent_versions` (item 5). O formulário fica desligado (não apagado) até a Rotina provar.
2. **Rotina no Claude Code** (`create_trigger`, sem cron — o operador dispara pelo app quando
   chega o e-mail), nome **"Hermes – decisão"**, sessão nova a cada disparo, neste repositório. O
   prompt (versionado em `hermes/DECIDIR.md`, novo):
   - lê `hermes_proposals` com `status = 'proposed'`;
   - para cada uma, mostra título, evidência mascarada, motivo, alvo e `como_medir`, e pergunta
     ao operador: **aprovar, recusar ou corrigir** (com motivo — vira o histórico que o Hermes lê);
   - grava a decisão nas mesmas colunas que o formulário gravava (`status`, `decision_reason`,
     `decided_at`); "corrigir" grava a correção do operador no motivo e aprova a versão corrigida;
   - aprovada → segue `hermes/IMPLEMENTAR.md` na mesma sessão (implementa, prova, mergeia, publica
     com versão nova).
3. **Rollback (L3 item 8):** o Hermes do lote seguinte compara a versão nova com a anterior; se
   handoff ou premissa indevida pioraram, ele abre proposta de **reverter** marcada como crítica,
   e a Rotina mostra essa primeiro. Revertida, a mudança é analisada, corrigida, testada e
   validada antes de voltar.

**Pronto quando:** uma proposta sintética (`pnpm hermes --source=personas:<dir> --write-db` num
lote de teste) chega como e-mail no formato novo; a Rotina mostra, o operador aprova, e a
`hermes_proposals` fica `accepted` → `published` com `agent_versions` novo.

---

## 7. Lucro por venda com o custo real — documentação

**Atualizar** a tabela do topo de
[`06-modelo-economico.md`](../../documentacao/contexto-negocio/06-modelo-economico.md) e o
simulador `docs/operacao/mapa-financeiro.html` com:

- **IA (modelo):** R$ 0,27 por lead (p50 medido em 30/09; p95 R$ 0,546; teto R$ 0,55) no lugar
  de R$ 0,10 — a 10% de conversão, R$ 2,70 por venda (era R$ 1,00);
- **WhatsApp:** R$ 0 por lead (atendimento e régua dentro da janela de 24 h e da janela gratuita
  de 72 h); só os templates UTILITY do pós-venda fora da janela (`order_eve`), US$ 0,0068 cada
  (~R$ 0,04) **por pedido**;
- **Recusa na porta:** 12–17% (**valor especulado, ainda precisa ser medido**), R$ 9,99 cada;
- **Devolução pós-envio:** 5–10%, R$ 25,00;
- **Lead:** CPL R$ 1,25–1,50;
- **Reserva:** todo custo de um pedido até a venda virar dinheiro (produto, manuseio, taxa de
  transação, entrega concluída, recusa, devolução) — o antecipado cai na hora no Mercado Pago; a
  entrega libera 14 dias depois do pagamento.

---

## 8. Portal no Vercel

**Pedido do operador:** hospedado no Vercel, atualizado a cada 1 h, períodos **dia, semana, mês,
3, 6, 9 e 12 meses**, um gráfico de linha por métrica e uma tabela comparando cada métrica com ela
mesma entre os períodos escolhidos (em %).

**Métricas da operação:** leads, pedidos, CPL, custo de API por lead, CPL + API, handoff, resposta
pronta (fallback), opt-out, taxa de conversão, ROI, faturamento, custo operacional, lucro bruto,
lucro líquido (comissões recebidas no dia).

**Seção "Quando pausar"** — os seis critérios do L3 item 6, cada um com o valor atual, o limite e
a cor: premissa indevida (> 5%), handoff (> 10%), opt-out (> 2,5%), custo de API (> R$ 0,75 em
mais de 5% dos últimos 100 leads), caixa reservado restante, saúde do canal (número e Cloud API).

**Seção por criativo/copy e por região — a definir com o operador (8 a 15 métricas).** Proposta
para discutir, já que pedidos por criativo não fecham amostra: CPM, CTR, custo por clique, custo
por conversa iniciada (CPL), taxa de resposta à primeira mensagem, % que chega ao preço, % que
recebe o link, conversão em pedido, ticket médio (peças), % antecipado × entrega, handoff, opt-out,
recusa na porta, custo de API por lead, ROI.

**O que falta decidir/obter antes de construir:**

1. **Onde mora o código:** este repositório não tem UI de propósito (`CLAUDE.md`). Proposta: um
   repositório novo `encorpa-portal` (Next.js no Vercel), lendo o Supabase só por views, com chave
   só-leitura — nunca a service_role no navegador.
2. **Conta e token do Vercel** (operador).
3. **Dados do anúncio** (gasto, impressões, cliques, CPL por anúncio/conjunto): API de Marketing da
   Meta, com token do sócio; atribuição pelo `referral` do CTWA já gravado na conversa.
4. **Comissões recebidas** (lucro líquido): Logzz/Coinzz/Mercado Pago — de onde vem o "recebido no
   dia" (webhook ou extrato).
5. **Login:** o portal mostra dinheiro; precisa de senha (Vercel Password Protection ou auth da
   Supabase).

---

## Reverificar: Malu executando troca, recusa, cancelamento e devolução sozinha

**Veredito vigente (R16.9, 29/09):** não dá — a API da Coinzz documenta só `POST /api/sales` e a da
Logzz só `GET /api/v1/products`; a devolução da Logzz é por formulário, e-mail
(trocasereembolsos@logzz.com.br) ou WhatsApp. A busca de 2026-10-02 não achou documentação pública
nova; a ajuda da Logzz diz que pedido em "Agendado", "Em separação" ou "A reagendar" se **exclui**
pelo painel, não se cancela.

**Fechado em 2026-10-02:** o operador mandou o print da página Integrações → API (Documentação):
o único endpoint é **`POST /api/sales` — "Salvar venda"** (cria venda ou reprocessa pagamento com
`order_hash`), com `payment_method` `afterpay | bank_slip | credit_card | pix`. Nenhum cancelar,
excluir, estornar ou devolver. **A automação sai do plano:** a Malu conversa com a cliente e manda o
handoff com os dados; o operador executa nas plataformas. Se a Logzz/Coinzz publicarem esses
endpoints, volta como código determinístico (R11.1).
