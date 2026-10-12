# Plano prático — Malu: vender mais, soar humana, funcionar sem quebrar

> Baseado em `analise-arquitetura-malu.md` (§0–§22). Nada aqui foi implementado.
>
> **Hoje:** sáb. 11/10/2026.
> - **No ar:** `turn` v16, `whatsapp` v24, modelo `muse-spark-1.3-contributor`.
> - **Volume:** 5 leads, 0 pedidos.
> - **Anúncios (L3):** começam **qui. 23/10**. Copy de 23 a 29/10, pausa de 30 a 31/10, Região de 01 a 07/11, leitura e decisão de 08 a 09/11.

## ▶ Status de execução (atualizado 2026-10-12) — LEIA PRIMEIRO

Legenda: ✅ feito e commitado · 🟡 feito no código, falta publicar/provar em produção · ⬜ não começado · ⛔ bloqueado.
Branch `claude/awesome-hopper-x8j8wb`. Grafo de decisões §69–§77. Nada abaixo de E1.3 está no ar.

| Etapa | Tarefa | Status | Onde está |
|---|---|---|---|
| E0 | 9 decisões do operador | ✅ | R20.1–R20.9 em `03-decisoes-tomadas.md`; D9 encerrado (memória) |
| E1.1 | Recusa vira estado (`declinesInBurst`, `DECLINE_REPLY`, régua para) | 🟡 | grafo §69, `tests/declined.test.ts` |
| E1.2 | Alarme de cobertura `job:"health"` | 🟡 | grafo §70; **falta o workflow no n8n** (abaixo) |
| E1.3 | Sem `retryOnFail` nos nós do turno (n8n) | ✅ no ar | grafo §71, versão ativa `b13736eb` |
| E1.4 | Escassez fora do "vou pensar", do prompt e do briefing | 🟡 | grafo §72 |
| E1.5 | Gates `hip_claim`, `courier_claim`, "afina de vez" | 🟡 | grafo §73 |
| E1 fim | Autoaprimoramento + 13 personas + `/code-review` | ✅ | grafo §74 (prazo pronto no lugar do handoff) |
| E2.1–E2.4 | Latência, estágios reais, braço A/B, cobertura guardada | 🟡 | grafo §75, migração `0026` (NÃO aplicada) |
| E2 fim | 461/461 mutações + personas + `/code-review` | ✅ | grafo §76 (1ª resposta nunca vira handoff) |
| E3.1–E3.4 | Recepção honesta, experimento A, abertura do modelo com o anúncio, H2/H4/H5/H7, link, pausa curta | 🟡 | grafo §77 |
| E4.1/E4.2/E4.4 | Eval de venda: comprador com propensão, métricas, score, comparação | ✅ (ferramenta) | `src/dev/sales-buyer.ts`, `src/dev/scenarios/venda.json`, `pnpm dev:eval --compare` |
| E4.3 | Juiz LLM calibrado | ⬜ | espera 20 conversas anotadas pelo operador |
| E3+E4 fim | Base × E3 pela E4 + `/code-review` | ✅ com ressalva | grafo §77: APROVADA (17,7 → 25,3; ruído 1,9); detector de mentira do comprador a consertar |
| E5 | Ensaio com dinheiro real | ⬜ | depende do deploy |
| E6 | L3 2×2 (23/10–09/11) | ⬜ | ligar `experiments.fastOpening` e (depois de construído) `linkAfterChoice` |
| E7–E8 | Otimização e escala | ⬜ | ver seções abaixo |

**Bloqueio de produção (⛔ para esta sessão):** o classificador de permissão do Claude Code recusou `pnpm deploy:turn` e
`pnpm dev:n8n`. A ordem para publicar tudo o que está 🟡 está no topo do `HANDOFF.md`.

**Ainda não construído dentro de E3/E6:** o experimento B (`linkAfterChoice`: link logo depois da escolha do pagamento) só tem o
braço sorteado e a flag (`armOn(…, "B")`); o comportamento entra antes do L3 (ver `HANDOFF.md`, próximos passos).

## Como ler este plano

O plano tem 8 etapas. Cada etapa tem:
- **objetivo**;
- **portão de saída**: o que precisa ser verdade para passar à próxima;
- **tarefas**.

Cada tarefa traz:
- **O quê:** a mudança, em uma frase.
- **Onde:** os arquivos tocados. Todo `src/agent/X.ts` tem espelho byte a byte em `supabase/functions/turn/X.ts`.
- **Quem:** o especialista de `.claude/agents/`. Gate, heurística de texto ou banco vão sempre em Opus.
- **Prova:** o que precisa passar.
- **Pronto quando:** o critério observável.
- **Esforço:** P = até meia sessão, M = 1 sessão, G = 2 ou mais sessões.

**Regras do `CLAUDE.md` que valem para toda tarefa de código** (não se repetem abaixo):
- teste primeiro (TDD), com negação nos dois sentidos se a tarefa mexe em texto;
- mutação em `verify-guards.ts` se a tarefa cria guarda;
- `pnpm test && pnpm dev:conversas && pnpm typecheck:function && pnpm lint`;
- `pnpm dev:gates` se mexeu em gate;
- revisão do `code-reviewer` (Opus);
- registro no grafo de decisões;
- deploy só com o "pode subir" do operador (`pnpm deploy:turn`);
- prova pela porta de produção.

---

## Calendário

| Datas | Etapa | Bloqueia L3? |
|---|---|---|
| 12/10 | **E0 — Decisões do operador** | Sim |
| 13–16/10 | **E1 — Proteção** (não perder venda nem o número) | Sim |
| 13–17/10 | **E2 — Medição** (sem ela, o L3 não ensina nada) | Sim |
| 15–19/10 | **E3 — Primeiro contato e humanização v1** | Sim (o mínimo) |
| 13–20/10 (paralelo, fora da produção) | **E4 — Eval comercial sintético** | Parcial: E3 precisa da versão mínima |
| 20–21/10 | **E5 — Ensaio geral com dinheiro real** | Sim |
| 22/10 | Congelamento: nada sobe | — |
| 23/10–09/11 | **E6 — L3 com experimentos** | — |
| 10/11 em diante | **E7 — Otimização com dado real** | — |
| Depois da decisão de escala | **E8 — Escala e limpeza** | — |

**Caminho crítico:**
1. E0.
2. E1.1, E1.2 e E1.3.
3. E2.1 e E2.3.
4. E3.1.
5. E5.
6. 23/10.

Se algo atrasar, **corta-se de E3, nunca de E1 ou E2**.

---

## E0 — Decisões do operador (12/10, sem código)

**Objetivo:** fechar o que só o operador pode decidir, para nenhuma sessão de código parar no meio.

**Portão de saída:** as 9 decisões abaixo respondidas e registradas em
`docs/documentacao/decisoes/03-decisoes-tomadas.md` (técnico).

| # | Decisão | Recomendação | Por quê (seção da análise) |
|---|---|---|---|
| D1 | Remover a escassez "restam 12 unidades" (`scarcity.allowUnverified` / `unitsLeft` no `BUSINESS_CONFIG`) | **Remover** | Sem contagem real por trás; usada até contra quem recusou (§18) |
| D2 | Tirar a recepção automática ("uma de nossas atendentes… acesse o site") | **Tirar**; a 1ª resposta vira a da Malu, rápida (E3.1) | Promete humano e tira a cliente da conversa (§19 R1) |
| D3 | Ordem: portal × proteção e medição | **E1 + E2 antes do portal** | Protegem as vendas do L3; o portal não |
| D4 | Rodar os 2 experimentos do L3 por lead (2×2), não antes/depois | **Sim** | Antes/depois confunde com a troca de criativo (§11) |
| D5 | Experimento A — abertura rápida: 1ª resposta ≤ 15 s + digitação curta × atual | **Sim, como teste** | Latência medida: p50 21 s no servidor + digitação + 60 s (§−1) |
| D6 | Experimento B — link logo após a escolha do pagamento × dados no chat antes | **Sim, como teste** | Corta de 2 a 3 trocas; a queixa original era link antes da decisão (§9 C4) |
| D7 | Testar a troca da regra "vírgula mais que ponto" (contraria R13 / §66) | **Testar no eval antes** | É a causa das frases emendadas (§19 R3) |
| D8 | Congelar o caminho do Hermes que implementa e publica sozinho (`IMPLEMENTAR.md`, `deploy-hermes.yml`) até ≥ 1.000 leads | **Congelar** | Sem dado não há o que aprender (§12) |
| D9 | Ponto LGPD do modelo `-contributor` falando com cliente real | **Levar ao `compliance-reviewer`** | O próprio repositório diz que ele "nunca fala com cliente real" (§13). A decisão do modelo é sua |

---

## E1 — Proteção: não perder venda nem o número (13–16/10)

**Objetivo:** fechar os buracos que já custaram venda ou que podem derrubar o número.

**Portão de saída:**
- E1.1, E1.2 e E1.3 no ar e provados pela porta de produção;
- E1.4 aplicado no config;
- E1.5 no ar.

### E1.1 — "Recusou" vira um estado (achado de 09/10)
- **O quê:**
  - nova saída `declines` no intérprete, separada de `wants_to_think`;
  - quando ela recusa: uma frase curta e calorosa, sem escassez, sem argumento e sem pergunta;
  - a régua de silêncio é cancelada e o estágio vira `perdido` com o motivo "recusou";
  - se ela voltar a falar, a Malu atende normalmente (não é opt-out).
- **Onde:**
  - `src/agent/interpret.ts`: o texto do intérprete nas linhas 110–111 tira "se despede desistindo" de `wants_to_think`, e `goodbyeParks` (linha 917) passa a distinguir despedida de recusa;
  - `supabase/functions/turn/index.ts`: o ramo de `thinkReply` (~3553) e o cancelamento da régua;
  - `src/agent/followups.ts`;
  - os espelhos.
- **Quem:** `backend-specialist` (Opus) + `conversation-designer` (a frase).
- **Prova:**
  - casos dos dois lados:
    - "não quero mais, obrigado" → recusa;
    - "vou pensar" → pensar;
    - "não quero pensar, quero comprar" → compra;
    - "não quero mais nada, só o link" → compra;
    - "deixa pra lá" → recusa;
  - mutação que reinstala o bug;
  - persona nova "recusa educada" (cópia curta de `persona-rose`);
  - grafo §69.
- **Pronto quando:** pela porta de produção, "não quero mais" recebe uma frase sem escassez, e `followups` fica sem nenhum toque agendado para essa conversa.
- **Esforço:** M.

### E1.2 — Alarme de cobertura e integração
- **O quê:**
  - um cron no n8n a cada 15 min chama `/turn {job:"health"}`;
  - a função consulta 3 CEPs que sabidamente têm entrega com pagamento na entrega (por exemplo, São Paulo capital), pelo mesmo código que a conversa usa (`lookupRegion`);
  - se qualquer um voltar sem COD ou com erro, o operador recebe um e-mail;
  - confirmar que toda consulta que falha vira região **desconhecida**, nunca "sem COD" (memória `coinzz-cep-so-digitos`).
- **Onde:**
  - `supabase/functions/turn/index.ts` (job novo, ~20 linhas, reaproveita `lookupRegion`);
  - `n8n/workflows/` (workflow novo, igual ao "Relógio da régua");
  - `src/dev/n8n-rules.ts` (o `dev:n8n` passa a conferir o workflow novo).
- **Quem:** `workflow-architect` (n8n) + `backend-specialist` (Opus).
- **Prova:**
  - teste com 422, 302, timeout e corpo sem `data` → "desconhecida" e e-mail;
  - **teste de fogo**: apontar um CEP inválido no ambiente de teste e ver o e-mail chegar.
- **Pronto quando:** o e-mail de teste chegou, e o cron aparece ativo no `pnpm dev:n8n`.
- **Esforço:** M.

### E1.3 — Resposta paga e nunca enviada (n8n repete → "duplicate")
- **O quê:**
  1. **Diagnóstico primeiro** (memória `diagnostico-antes-de-consertar`): reproduzir com um turno que passe de 150 s.
  2. Depois escolher entre:
     - **(a)** tirar o `retryOnFail` do nó "Cerebro do turno" (`turno-da-agente.json:29`) e deixar a função cuidar do reenvio, porque ela já tem `retry_turn`;
     - **(b)** num "duplicate", devolver a resposta já gravada e ainda não enviada.

  Preferência por **(a)**: é menor e não arrisca envio dobrado quando a própria Meta reenvia o webhook.
- **Onde:** `n8n/workflows/turno-da-agente.json` (via `pnpm dev:n8n`; cuidado com a memória `dev-n8n-sobrescreve-workflows`).
- **Quem:** `workflow-architect`.
- **Prova:** reprodução antes e depois; `pnpm dev:n8n` ok.
- **Pronto quando:** um turno lento não deixa resposta órfã em `messages` sem envio.
- **Esforço:** P.

### E1.4 — Escassez fora (depende de D1)
- **O quê:** tirar a escassez no `BUSINESS_CONFIG`, que só o operador grava; conferir que `thinkReply` fica sem ela.
- **Onde:** o secret em produção; `config/business.example.json` acompanha.
- **Quem:** operador + `compliance-reviewer`.
- **Prova:** o teste de `thinkReply` com a escassez ausente já deve existir (`scarcityBriefing`); conferir.
- **Pronto quando:** "vou pensar" pela porta de produção chega sem "restam".
- **Esforço:** P.

### E1.5 — Gates para os fatos que geram devolução (H12)
- **O quê:** vetar três afirmações:
  - **quadril / bumbum**: "pega o quadril", "modela cintura e quadril";
  - **comportamento do entregador**: "toca a campainha", "liga antes", "deixa na portaria";
  - **"afina" com sentido definitivo.**

  Todas com negação nos dois sentidos: "não modela o quadril" passa.
- **Onde:** `src/agent/guardrails.ts` (gates novos ou extensão de `health_claim` / `weight_loss_claim`), `tests/`, `tests/gate-corpus.txt`, os espelhos.
- **Quem:** `backend-specialist` (Opus) + `code-reviewer` (Opus, segunda revisão obrigatória por ser heurística).
- **Prova:**
  - as duas frases reais da §19 vetadas;
  - `dev:gates` sem afrouxamento;
  - mutação.
- **Pronto quando:** as duas mentiras reais são vetadas e nenhuma frase honesta do corpus vira veto.
- **Esforço:** M.

---

## E2 — Medição: sem ela, o L3 não ensina nada (13–17/10)

**Objetivo:** que cada lead do L3 gere dado útil:
- latência;
- o ponto do funil onde parou;
- o braço do experimento em que caiu.

**Portão de saída:** as views novas devolvem números corretos para as conversas de teste da E5.

### E2.1 — Latência gravada
- **O quê:**
  - `llm_calls.latency_ms` passa a ser escrito pela `turn` (hoje só o `whatsapp` escreve);
  - nova coluna `turn_outcomes.duration_ms`, medida da mensagem dela até a resposta pronta;
  - view `eval_latency` com p50 e p90 por dia e por braço.
- **Onde:** `index.ts` (`recordCall` ~653, `recordOutcome` ~494); migração `0026`; espelhos.
- **Quem:** `backend-specialist` (Opus).
- **Prova:** teste de `recordCall` com a latência; a view sobre dados de teste.
- **Pronto quando:** uma conversa de teste mostra a duração de cada turno.
- **Esforço:** P.

### E2.2 — Estágios reais do funil
- **O quê:** trocar o `endereco_coletado`, que nunca é alcançado, por três estágios que a conversa atravessa:
  - `cobertura_conhecida`;
  - `caminho_escolhido`;
  - `link_enviado`.

  Todos sem regressão, pelo `furthest`, que já existe.
- **Onde:**
  - `src/agent/state-machine.ts` (`STAGES`, `TRANSITIONS`, `reachedStage`, `LADDER`);
  - migração `0026` (o `check` de `conversations.stage` + um mapeamento dos dados antigos);
  - `0018_evaluation_views` (refazer `eval_funnel`);
  - os espelhos.
- **Quem:** `backend-specialist` (Opus) + `test-engineer`.
- **Prova:**
  - testes de `furthest` com os novos degraus;
  - `dev:conversas` atualiza o estágio esperado;
  - leitura da memória `stage-nunca-e-escrito`.
- **Pronto quando:** uma conversa de teste que recebeu o link aparece em `link_enviado`.
- **Esforço:** M.

### E2.3 — Braço A/B por lead
- **O quê:**
  - coluna `leads.arm` (jsonb) gravada no 1º turno com dois sorteios **independentes**, um hash do telefone para cada experimento: `{"A": 0|1, "B": 0|1}`;
  - o config ganha `experiments` opcional, ausente = ninguém em teste (memória `business-config-sobrescreve`);
  - a `turn` lê o braço e liga a flag correspondente;
  - `turn_outcomes` e as views agrupam por braço.
- **Onde:** migração `0026`; `index.ts` (leitura do lead + flags); `src/config/business.ts` (tipo opcional); views; espelhos.
- **Quem:** `backend-specialist` (Opus).
- **Prova:**
  - o sorteio é estável (o mesmo telefone cai sempre no mesmo braço) e equilibrado (~50/50 em 1.000 telefones);
  - config sem `experiments` → comportamento de hoje.
- **Pronto quando:** dois leads de teste caem em braços diferentes e a view separa os dois.
- **Esforço:** M.

### E2.4 — Guardar a cobertura por CEP (latência)
- **O quê:**
  - guardar `checked_at` junto de `codAvailable` / datas em `leads.address`;
  - reconsultar a Coinzz só se o CEP mudou ou se passou mais de 1 h;
  - falha nunca é guardada como "sem COD".
- **Onde:** `index.ts` (~3235), `src/agent/availability.ts`, os espelhos.
- **Quem:** `backend-specialist` (Opus).
- **Prova:** teste de cache acertado, CEP novo e cache vencido; a falha não grava.
- **Pronto quando:** o segundo turno com o mesmo CEP não chama a Coinzz (log).
- **Esforço:** P.

---

## E3 — Primeiro contato e humanização v1 (15–19/10)

**Objetivo:** a Malu responder rápido, no assunto da cliente, sem soar como roteiro.

**Portão de saída:**
- E3.1 e E3.2 no ar;
- o eval mínimo da E4 mostra a nova versão **igual ou melhor** em naturalidade, **sem nenhuma mentira a mais**.

### E3.1 — Abertura única, rápida, no assunto do anúncio (H1; depende de D2 e D5)
- **O quê:**
  - sai a recepção automática;
  - sai a saudação fixa "darei início ao seu atendimento… Em que posso te ajudar?" (`retry.ts:381` `greetingFor`);
  - a 1ª resposta é do modelo e responde o que ela escreveu;
  - uma diretiva nova traz o anúncio de origem (`leads.source.headline`, que já é guardado por `whatsapp.ts:121`): "ela veio do anúncio <headline>".

  O tempo da 1ª resposta vira flag do experimento A:
  - braço 0 = hoje (60 s);
  - braço 1 = sem espera fixa.

  **Se D2 for "manter a recepção"**, só o texto muda: tira "atendentes" e o site.
- **Onde:** `retry.ts` (`WELCOME_AUTO_REPLY` 371, `greetingFor` 381, `WELCOME_RESUME_DELAY_SECONDS` 414); `index.ts` (ramo do lead novo ~2244); `prompt.ts` (diretiva de origem); os espelhos.
- **Quem:** `prompt-engineer` (Opus) + `backend-specialist` (Opus) + `conversation-designer`.
- **Prova:**
  - `tests/prompt.test.ts` com a diretiva;
  - o gate `humanity_claim` continua passando: a abertura não diz nem nega ser IA;
  - persona Neusa (telegráfica) e Rafa (com pressa).
- **Pronto quando:** pela porta de produção, a 1ª mensagem recebe uma resposta que cita o assunto dela, sem "atendente".
- **Esforço:** M.

### E3.2 — Pacote de humanização v1 no prompt (H2, H4, H5, H7)
- **O quê** (só o que não é polêmico):
  - **H2 — espelhar o tamanho e o tom dela.** Diretiva calculada por código: média de palavras dela nas últimas 3 mensagens, "kkk", emoji. Exemplo: "ela escreve curto e informal: 1 balão de até ~15 palavras".
  - **H4 — lista de ~8 tiques a evitar:** "Que bom que…", "darei início", "Em que posso te ajudar", "Perfeito!", "certinho" repetido, "Entendo,", "obrigada por escolher", "fico de olho".
  - **H5 — exemplos de diálogo no lugar de frases prontas.** Tirar os 8 trechos com "Ex.", "Por exemplo" ou "Use esta frase" que o modelo copia. Entram 3 trocas curtas completas, com a regra "não reuse estas frases". Fica só a frase canônica do frete, que o gate exige.
  - **H7 — pergunta de compra vence o gancho de dor.** Se ela perguntou tamanho, preço, entrega ou como comprar, a resposta avança isso; o gancho só entra quando ela hesita.
- **Onde:** `src/agent/prompt.ts` (blocos "COMO ISSO VIRA FRASE", "VOCÊ É VENDEDORA", "COMO VOCÊ ESCREVE"); `index.ts` (cálculo da diretiva H2, ~10 linhas); espelhos; `docs/agente-ia/06-script/04-changelog-do-prompt.md`.
- **Quem:** `prompt-engineer` (Opus) + `conversation-designer`.
- **Prova:**
  - `tests/prompt.test.ts`: toda frase que o prompt ensina passa os gates;
  - **eval mínimo da E4** antes × depois: naturalidade, tiques por conversa, sobreposição com o prompt (nenhuma sequência de 6+ palavras igual), mentiras = 0;
  - as 12 personas adversariais sem regressão.
- **Pronto quando:** o eval mostra menos tiques, nenhuma cópia de exemplo e nenhuma mentira nova.
- **Esforço:** M.

### E3.3 — Moldura livre nos textos fixos (H10, parcial)
- **O quê:**
  - o texto em volta do link perde "Perfeito! … obrigada por escolher a Encorpa" (`linkMessage`, `retry.ts:213`) e fica curto: "Pronto, aqui seu link, lá você completa o endereço e escolhe o M:";
  - o "vou pensar" fica sem escassez (de E1.4), mais curto.

  Os números continuam fixos.
- **Onde:** `retry.ts`; os espelhos.
- **Quem:** `conversation-designer` + `prompt-engineer`.
- **Prova:** o texto novo passa a cadeia de gates; `dev:conversas`.
- **Pronto quando:** o texto do link não tem "obrigada por escolher".
- **Esforço:** P.

### E3.4 — Digitação curta (flag do experimento A)
- **O quê:** braço 1 do experimento A: pausa do 1º balão ≤ 3 s, dos demais ≤ 6 s, total ≤ 12 s. Braço 0: como hoje (560 ms por palavra, teto de 25 s por balão).
- **Onde:** `index.ts` (`bubbleDelayMs` ~929, passa a ler o braço); o n8n "WhatsApp envio" não muda, porque já usa o `delayMs` que a função manda.
- **Quem:** `backend-specialist` (Opus).
- **Prova:** teste de `bubbleDelayMs` nos dois braços.
- **Pronto quando:** dois leads de teste em braços diferentes recebem pausas diferentes.
- **Esforço:** P.

**Fica para a E7 (precisa de mais eval):**
- H3 (a regra da vírgula);
- H6 (nem toda mensagem termina em pergunta);
- H8 (régua escrita pelo modelo);
- H9 (insistência);
- prompt por estágio.

---

## E4 — Eval comercial sintético (13–20/10, paralelo, fora da produção)

**Objetivo:** medir venda e naturalidade sem o operador conversar, para aprovar mudanças antes de subir.

**Portão de saída:**
- a versão **mínima** (E4.1 + E4.2 + E4.4) roda sobre a v16 e sobre a versão de E3, e dá um número comparável;
- o juiz (E4.3) pode vir até 20/10 ou entrar na E7, se D7 e a calibração não fecharem a tempo.

### E4.1 — Comprador com propensão oculta
- **O quê:**
  - 16 cenários em YAML: os 14 arquétipos + "recusa educada" + "pergunta o preço na 1ª mensagem";
  - cada cenário tem perfil, CEP real (com e sem COD), número da calça, headline do anúncio, propensão inicial (0–100), 3 objeções guardadas e as regras de subida e descida (§10);
  - o cliente é um modelo diferente do da agente (Claude Sonnet, como as personas);
  - **reaproveita `persona-run-core.ts`** (portas local, deploy e n8n, orçamento, máscara de dado pessoal); só muda o roteiro do cliente.
- **Onde:** `src/dev/` (cenários + extensão do runner); `data/persona-runs/` (saída).
- **Quem:** `test-engineer` + `conversation-designer`.
- **Prova:** a mesma seed dá a mesma conversa (dentro da variação do modelo); o custo por rodada fica registrado.
- **Pronto quando:** `pnpm dev:personas --suite=venda` roda os 16 cenários e grava as transcrições.
- **Esforço:** G.

### E4.2 — Métricas determinísticas de venda e de naturalidade
- **O quê:** estender `persona-scorecard.ts` com:
  - comprou (simulado);
  - chegou ao preço, ao tamanho, ao CEP, ao caminho e ao link;
  - trocas até o link;
  - palavras por balão ÷ palavras dela;
  - tiques por conversa;
  - sobreposição de n-gramas com o prompt;
  - % de mensagens que terminam em pergunta;
  - latência e tokens.

  **Mentira** = `runGates` rodado de novo sobre o que foi enviado (já existe).
- **Onde:** `src/dev/persona-scorecard.ts`.
- **Quem:** `test-engineer`.
- **Prova:** teste de cada métrica com uma transcrição fixa.
- **Pronto quando:** `_placar.json` traz as métricas novas.
- **Esforço:** M.

### E4.3 — Juiz de naturalidade e de venda (calibrado)
- **O quê:**
  - rubrica de 1 a 5 em 8 eixos (§10), com a frase citada em cada nota;
  - calibração com 20 conversas anotadas pelo operador: um eixo só fica se concordar ≥ 80% com o operador.

  **Reabre o "juiz tipado / JEV" com outro motivo e outro uso** (§−1): é sobre conversa sintética, não real.
- **Onde:** `src/dev/` (juiz) + `docs/agente-ia/05-plano/` (a rubrica).
- **Quem:** `prompt-engineer` (Opus) + `model-cost-governor` (o custo do juiz).
- **Prova:** a tabela de concordância com o operador.
- **Pronto quando:** pelo menos 5 eixos calibrados.
- **Esforço:** G.
- **Operador:** anotar as 20 conversas (~1 h).

### E4.4 — Score comercial e comparação de versões
- **O quê:**
  - `score = 50 × conversão simulada + 20 × avanço no funil + 15 × juiz + 15 × eficiência`;
  - **barreiras fora da média:** qualquer mentira ou opt-out ignorado reprova a versão;
  - tabela "versão × métrica" lado a lado;
  - **regra de aprovação, escrita antes:** a versão nova sobe se o score não cair, as barreiras ficarem em zero e a naturalidade (ou os tiques) melhorar.
- **Onde:** `src/dev/persona-eval.ts` (já compara rodadas).
- **Quem:** `test-engineer`.
- **Prova:** v16 × v16 dá diferença ≈ 0 (mede o ruído).
- **Pronto quando:** existe o comando que compara duas rodadas.
- **Esforço:** M.

---

## E5 — Ensaio geral com dinheiro real (20–21/10)

**Objetivo:** provar, com dinheiro e com o anúncio de verdade, que tudo funciona de ponta a ponta antes de gastar verba. Esta é a pendência "2" do quadro do `HANDOFF.md`.

**Portão de saída:** as duas compras entram em `orders` com tamanho, estágio, braço e latência certos, e nenhum alarme dispara à toa.

1. **Operador e sócio, cada um por um anúncio CTWA real (verba mínima):**
   - uma compra **antecipada** com Pix pago;
   - uma compra com **pagamento na entrega**, num CEP com COD.
   Para cobrir os dois braços, um dos dois cai em cada braço do experimento A (forçado por telefone de teste).
2. **Conferir:**
   - `orders` (tamanho, caminho);
   - `conversations.stage` com os estágios novos;
   - `leads.arm`;
   - `turn_outcomes.duration_ms`;
   - `leads.source.headline` usado na abertura;
   - o webhook "Venda confirmada".
3. **Recusa:** um terceiro número diz "não quero mais". Conferir que não há escassez e que a régua foi cancelada.
4. **Auditoria das conversas** pelo roteiro de `docs/operacao/auditar-conversa-real.md`, gravada em `docs/agente-ia/10-auditoria/`.
5. **Alarme:** confirmar que o cron de saúde rodou o dia todo sem alarme falso.

**Esforço:** M (operador + 1 sessão).

---

## E6 — L3 com experimentos (23/10–09/11)

**Objetivo:** aprender o máximo com ~470 leads sem mexer na agente durante o teste.

**Portão de saída:** a leitura de 08–09/11 feita pelas regras escritas **antes** de começar.

### E6.1 — Regras do teste, escritas antes de 23/10
- **Agente congelada.** Nenhum deploy de prompt ou gate durante o L3. Só correção de bug que perde venda ou que mente, com o operador.
- **Desenho 2×2 por lead:**
  - **A** = abertura rápida + digitação curta × atual;
  - **B** = link após a escolha × dados no chat.

  Os dois sorteios são independentes, então os dois experimentos usam **todos** os leads. O teste de criativo e de região do L3 (por anúncio) é ortogonal aos dois.
- **Métrica de cada experimento**, com base alta para caber na amostra:
  - **A:** respondeu à 1ª mensagem; chegou ao preço.
  - **B:** link → pedido criado; pedido criado ÷ lead.
- **Amostra:** ~235 por braço → detecta diferenças de ~12–13 pontos em métricas perto de 50%. **Diferença menor que isso é empate, e no empate fica o mais simples.** Para "B → pedido", a amostra é pequena: o resultado é **indício**, não prova (§11).
- **Teste:** duas proporções, bilateral, α = 5%, sem olhar no meio para decidir.
- **Parada de segurança** (por braço): o lead pede pessoa > 10%, opt-out > 2,5%, qualquer mentira confirmada, alarme de cobertura. Os mesmos critérios de pausa do pipeline, agora por braço.
- **Onde:** `docs/agente-ia/05-plano/12-experimentos-l3.md` (novo).
- **Quem:** `technical-writer` + operador assina.
- **Esforço:** P.

### E6.2 — Acompanhamento diário (sem mexer)
- **O quê:** todo dia, uma leitura das views por braço:
  - funil;
  - latência p50 e p90;
  - opt-out;
  - pedido de pessoa;
  - alarmes.

  As conversas com recusa, handoff ou silêncio no link são lidas por amostra.
- **Onde:** `pnpm dev:painel`, ou o portal se já existir.
- **Quem:** operador; o Hermes roda normalmente, só proposta, nada se publica (D8).

### E6.3 — Leitura e decisão (08–09/11)
- **O quê:**
  1. Decisão de escala (tabela L3.7: conversão, CPL, ROI).
  2. Vencedor de A e de B, ou empate.
  3. Lista de objeções reais.
  4. Ponto do funil onde mais se perde.
  5. Recusa na porta por caminho.
- **Onde:** `docs/agente-ia/10-auditoria/2026-11-l3-leitura.md`.
- **Quem:** operador + `technical-writer` + `pricing-guardian` (margem real).

---

## E7 — Otimização com dado real (a partir de 10/11)

**Objetivo:** usar o que o L3 mostrou para a próxima rodada. Cada item passa pelo eval (E4) antes de subir, e em produção, só um A/B por vez.

**Ordem sugerida** (reordenar pelo que a E6.3 mostrar):

| # | Tarefa | O quê | Onde | Quem | Esforço |
|---|---|---|---|---|---|
| E7.1 | Subir os vencedores de A e B | O braço vencedor vira o padrão; sai o perdedor | `index.ts`, config | `backend-specialist` | P |
| E7.2 | Régua escrita pelo modelo dentro da janela de 24 h (H8) + 1 toque só para lead frio (§8) | O código decide **se** e **quando**; o modelo escreve o **quê**, com o contexto, passando os mesmos gates; se vetar, cai no texto fixo de hoje. Fora da janela, continua o template da Meta | `followups.ts`, `index.ts` (sweep) | `conversation-designer` + `backend-specialist` (Opus) | G |
| E7.3 | H3 + H6 (sem frase emendada; nem toda mensagem termina em pergunta) | Só se o eval aprovar (D7) | `prompt.ts` | `prompt-engineer` (Opus) | M |
| E7.4 | H9 (insistência → mudar a abordagem ou oferecer pessoa) | Generalizar `cep_insist` / `size_insist` | `index.ts`, `prompt.ts` | `backend-specialist` (Opus) | M |
| E7.5 | Prompt por estágio + investigação do cache (hoje 12%) | Um núcleo fixo no começo; o bloco do estágio e só os briefings que valem nele no fim | `prompt.ts`, `guardrails.ts` (`gateBriefing` por estágio) | `prompt-engineer` + `model-cost-governor` | G |
| E7.6 | Hermes vê pedidos (H4) e devolve hipóteses de experimento, não patches | Acrescentar `orders`, `eval_funnel` e os braços ao pacote do Hermes; ajustar a skill | `src/dev/hermes-core.ts`, `hermes/skills/` | `backend-specialist` | M |
| E7.7 | Lead score de decisão (§8), calibrado com regressão nos sinais reais | Usado na régua, na prioridade do handoff e no risco de recusa no COD | view + `followups.ts` | `backend-specialist` + `pricing-guardian` | M |
| E7.8 | Recusa na porta por perfil de conversa | View que liga `recusado` aos sinais da conversa | migração (view) | `backend-specialist` | P |
| E7.9 | E-mail de handoff com o rascunho vetado, o motivo e o score | Operador responde em um clique | `index.ts`, n8n | `workflow-architect` | P |
| E7.10 | Conversions API (Purchase com `ctwa_clid`) | A Meta passa a otimizar para quem compra | repositório `encorpa-campanhas` | sócio + `workflow-architect` | G |
| E7.11 | Testes A/B seguintes | Botões interativos de tamanho e pagamento; uma chamada só ao modelo; `reasoning_effort` low × minimal (H13) | — | conforme o caso | — |

---

## E8 — Escala e limpeza (depois da decisão de escalar)

| # | Tarefa | Quando |
|---|---|---|
| E8.1 | Destravar o caminho automático do Hermes | Só com ≥ 1.000 leads e ≥ 100 pedidos |
| E8.2 | Remover o código morto: `callLuna` / OpenAI / Gemini, `jobs`, o gate `pacing`, `buildCoinzzRequest` e os campos de resposta sem consumidor, os helpers só de teste, o ramo `markRead` | Depois do L3 (a higiene foi cortada do V1 de propósito) |
| E8.3 | Unificar o seam (`src/llm/seam.ts` × `callMuse` da `turn`) | Junto da E8.2 |
| E8.4 | Mais verba e criativos, atribuição por anúncio × conversão na agente | Decisão do dia 18 do L3 |
| E8.5 | Multicanal | Só se houver tráfego que o justifique |

---

## Resumo em uma tabela

| Etapa | Entrega | Ganho esperado | Risco que fecha |
|---|---|---|---|
| E0 | 9 decisões | Nenhuma sessão para no meio | — |
| E1 | Recusa como estado, alarme, retry, escassez fora, gates de fato | Não perde venda por falha e não queima o número | Bloqueio do número, COD sumindo, mentira |
| E2 | Latência, estágios reais, braço A/B, guarda da cobertura | O L3 vira aprendizado | Teste cego |
| E3 | Abertura rápida no assunto, humanização v1, moldura livre | Mais resposta no 1º minuto; menos cara de robô | Lead frio que esfria |
| E4 | Eval de venda e naturalidade | Toda mudança provada antes de subir | Opinião no lugar de dado |
| E5 | Ensaio com dinheiro real | Ponta a ponta comprovado | Descobrir bug com verba ligada |
| E6 | L3 2×2 | Decisão de escala + vencedores de A e B | Ler ruído como resultado |
| E7–E8 | Régua viva, prompt por estágio, Hermes com pedido, CAPI, score, limpeza | Otimização contínua | — |
