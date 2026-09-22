# Plano de execução — do estado de hoje até os primeiros testes reais

> **Status:** plano de execução, montado em 2026-09-22 por decisão do operador registrada
> em [`HANDOFF.md` §PRÓXIMA SESSÃO](../../../HANDOFF.md#próxima-sessão--montar-o-plano-de-execução-até-os-primeiros-testes).
> Nenhum código de produção muda por causa deste documento — ele diz o que fazer, em que
> ordem, e **como se sabe que fechou**.
>
> Substitui o [`README.md`](README.md) desta pasta como plano vivo. O README continua
> valendo como registro do desenho original (a árvore de funções, as ondas A1–A4) — mas a
> seção "Onde estamos" dele está desatualizada desde 2026-09-06.

## Como ler

1. [As três regras do plano](#as-três-regras-do-plano)
2. [O mapa das plataformas](#o-mapa-das-plataformas--quem-chama-quem)
3. [O que mudou desde o último handoff](#o-que-mudou-desde-o-último-handoff-2026-09-22)
4. [As sete fases](#as-sete-fases)
5. [Ordem de execução e o que pode andar em paralelo](#ordem-de-execução)
6. [Critério de saída — quando os testes reais começam](#critério-de-saída)
7. [O que este plano deliberadamente não cobre](#o-que-este-plano-não-cobre)

> **Leia junto:** [`04-analise-de-arquitetura.md`](04-analise-de-arquitetura.md) (2026-09-22)
> avalia a proposta de arquitetura em closed loop (Evaluation Layer · Hermes · Sandbox) contra
> este código. Dela saíram os itens **3.3 corrigido, 3.6, 3.7 e 3.8** da fase 3 — quatro
> achados de código, dois deles urgentes por prazo.

---

## As três regras do plano

1. **Nada entra como "pronto" sem prova pela porta de produção.** Sonda contra a Edge
   Function prova o código, não o caminho — o webhook do n8n já devolveu 200 por um dia
   inteiro sem criar conversa nenhuma
   ([memória](../../../.claude/memory/verificar-pela-porta-de-producao.md)). Todo item
   tem uma linha **Fechou quando** que é verificável por alguém que não confie em quem
   escreveu o item.
2. **O método é testar, não auditar o handoff.** Este arquivo já errou nas duas direções.
   A varredura de 21/09 é o exemplo: uma decisão registrada como fechada ("o M é
   parametrização") caiu com quatro minutos de `curl`. Onde este plano diz "confirmar",
   significa executar, não reler.
3. **Um negativo em massa é suspeito até prova em contrário.** Falha de rede e "praça sem
   COD" são indistinguíveis na leitura
   ([memória](../../../.claude/memory/varredura-falso-negativo.md)). Toda varredura deste
   plano começa por um caso-controle conhecido-positivo.

---

## O mapa das plataformas — quem chama quem

Sete peças. A regra que decide onde algo mora continua sendo a mesma:
**regra de negócio é código versionado com teste; credencial, relógio e chamada HTTP são cano.**

```
                       ┌──────────────────────────┐
     Meta Ads ────────►│  WhatsApp Cloud API      │  ⚠ sem token ainda
     (CTWA, ctwaClid)  │  (número já no WA Business)
                       └───────────┬──────────────┘
                                   │ webhook de mensagem
                                   ▼
                       ┌──────────────────────────┐
                       │  n8n (PikaPods)          │  cano e relógio, 3 workflows
                       │  HnGrxquQLpfbXWLH  turno │
                       │  gS72LhYGOnmyALRq  venda │
                       │  SVDtFUi2N9oOskkx  régua │
                       └───────────┬──────────────┘
                                   │ POST { externalId, from, body }
                                   │ POST { job: "followups" }      (cron 5min)
                                   │ POST { job: "order", order }   (venda)
                                   ▼
                       ┌──────────────────────────┐
                       │  Edge Function `turn`    │  o cérebro — 19 gates, máquina
                       │  (Supabase, Deno, v32)   │  de estados, régua, teto de custo
                       └──┬────────┬───────────┬──┘
                          │        │           │
              ┌───────────┘        │           └──────────────┐
              ▼                    ▼                          ▼
     ┌─────────────────┐  ┌─────────────────┐      ┌────────────────────┐
     │ Supabase/Postgres│ │ Provedores LLM  │      │ Logzz / Coinzz     │
     │ leads, conversa- │ │ Muse Spark 1.3  │      │ COD / antecipado   │
     │ tions, messages, │ │ (conversa)      │      │ stock-and-delivery │
     │ orders, followups│ │ Gemini 3.5 FL   │      │ webhook de venda   │
     │ llm_calls,       │ │ (barato)        │      └────────────────────┘
     │ gate_traces      │ └─────────────────┘
     └────────┬─────────┘
              │ lê conversas
              ▼
     ┌─────────────────┐
     │ Hermes Agent    │  propõe mudanças, nunca publica sozinho
     │ hermes_proposals│  ⚠ não construído ainda — onda A4
     └─────────────────┘
```

**As quatro travessias que quebram na vida real, e onde cada uma é provada neste plano:**

| Travessia | Quem prova | Fase |
|---|---|---|
| Cloud API → n8n → Edge Function (um turno) | persona pela porta de produção | 2 e 7 |
| Edge Function → Coinzz/Logzz (criar pedido) | pedido sintético nos dois caminhos | 4 |
| Coinzz/Logzz → n8n → `job: "order"` (venda volta) | payload real que já chegou | 4 |
| cron n8n → `job: "followups"` → Cloud API (régua) | toque fora da janela de 24h | 6 |

**O que o n8n NÃO pode ganhar:** guardrail, máquina de estados, teto de custo, decisão de
preço. Se uma tarefa deste plano parecer mais fácil resolvida com um nó de `Function` no
n8n, ela está no lugar errado.

---

## O que mudou desde o último handoff (2026-09-22)

Três coisas que o operador confirmou nesta sessão e que mudam a ordem do plano:

1. **`META_API_KEY` existe.** O eval de Muse Spark 1.3 — o passo (b) da Frente 5, que
   nunca rodou porque faltava credencial — **passou a ser executável**. Ele sai do
   "em aberto indefinidamente" e vira pré-requisito de deploy (fase 3).
2. **O webhook real da Coinzz já chegou.** A Frente 0.3 deixa de ser espera e vira
   trabalho: o mapeamento e o `payment_method` saem de dedução para fato (fase 4).
3. **O número do WhatsApp já está no WA Business, mas ainda não há Cloud API nem token.**
   A Frente 2 continua bloqueada, porém o bloqueio agora tem prazo e dono. Tudo que dá
   para preparar sem token está isolado na fase 6, e **não bloqueia as fases 1 a 5**.

Uma decisão a mais, tomada nesta sessão: **o operador vai parametrizar frete na oferta do
antecipado da Coinzz, em data indefinida.** Isso torna a saída C da Frente 4 item 6
obrigatória e **anterior** à mudança do secret — sem ela existe uma janela em que a agente
cobra frete que a operação não cobra, ou promete grátis um frete que passou a existir.

---

## As sete fases

### Fase 1 — A verdade do estado atual

Nada aqui depende de credencial nova, de decisão do operador, ou de outra fase. É a
fundação: o plano inteiro assume coisas que só esta fase confirma.

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 1.1 | **Diffar a v32 no ar contra o `main`.** Baixar os dez arquivos da função deployada pela API de gerência e comparar byte a byte com o disco. | agente | Existe um diff escrito, com as divergências nomeadas uma a uma. Se vier vazio, isso também é resultado e vai no handoff. |
| 1.2 | **Rodar os cinco comandos canônicos**: `pnpm install`, `lint`, `typecheck`, `test`, `typecheck:function`. | agente | Os cinco verdes, com o número de testes registrado. Vermelho aqui vira o item 0 de tudo. |
| 1.3 | **Contar os leads trancados por `handoff_at`.** A cota esgotada de 09/09 e qualquer `ModelConfigError` anterior ao fix escreviam o campo, que nunca é limpo. | agente + operador | Uma query com o número exato, e uma decisão do operador: limpar, ou deixar. Sem decisão, não se mexe no banco. |
| 1.4 | **Ler o `BUSINESS_CONFIG` do painel** — campo a campo, incluindo os que "nascem ausentes". | operador | O operador cola os campos (sem valor de credencial) e o agente confirma contra `config/business.example.json`. Esta é a única forma de ler o secret: ele não é legível pela API. |
| 1.5 | **Inventariar os três workflows n8n.** Confirmar que o nó `Wait` da recepção automática **não existe** (o handoff afirma que não, ninguém verificou depois). | agente | Exportação dos três workflows lida, e o caminho `welcomed → Wait → resume: true` descrito como está hoje. |

> **Armadilha desta fase:** o MCP do n8n falhou em conectar nesta sessão. Se continuar
> falhando, 1.5 vira tarefa do operador (exportar o JSON dos workflows e colar).

---

### Fase 2 — As personas de teste interno

A especificação completa está em
[`03-personas-de-teste-interno.md`](03-personas-de-teste-interno.md). Aqui está só o que
precisa ser construído e como se sabe que ficou bom.

**Por que isto vem antes do deploy e não depois.** O harness que existe hoje
(`src/dev/engine.ts` — 60 arcos × 5 personas, 300 conversas) é **determinístico e escrito
por quem escreveu o agente**. Ele prova que o código faz o que o autor imaginou; não
descobre a frase que ninguém imaginou. A cegueira a negação e o "calço 38 → cintura 38"
foram achados assim — por acidente, tarde, e cada um custou uma correção em produção.

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 2.1 | **Doze agentes-persona** em `.claude/agents/persona-*.md`, um arquivo cada, com dor, objeção, gatilho e jeito de escrever próprios. Cada um tem **proibição explícita de saber que é teste** — não pode citar gate, preço interno, nem cooperar. | agente | Os doze arquivos existem, e cada um passa o teste do espelho: lido sozinho, sem o resto do repositório, produz uma cliente reconhecível. |
| 2.2 | **Runner `src/dev/persona-run.ts`** — envia as mensagens da persona **pela porta de produção** (webhook do n8n), com `--door=function` como fallback explícito e marcado no relatório. Grava a conversa inteira, os `gate_traces` e o custo. | agente | Uma conversa completa roda ponta a ponta e aparece em `conversations`/`messages` no Supabase. Se o corpo voltar 200 sem criar linha, o runner **falha** — não passa. |
| 2.3 | **Rubrica de falha**, escrita antes de rodar. Quatro classes: mentira (gate deveria ter pego e não pegou), perda (a venda morre por causa da agente), atrito (a cliente precisa repetir), custo (estouro do teto). | agente | A rubrica existe em arquivo e cada persona declara qual classe ela caça. |
| 2.4 | **Rodada 1 das doze personas** e o relatório. | agente | Relatório com uma linha por persona: o que ela tentou, o que a agente respondeu, e a classificação. Achado sem entrada concreta reproduzível não entra. |
| 2.5 | **Fechar os achados da rodada 1** e rodar de novo. | agente | Rodada 2 sem regressão e com os achados da 1 fechados ou explicitamente aceitos pelo operador. |

**Limite honesto desta fase:** persona dirigida por modelo é um oponente, não uma cliente.
Ela acha buraco que a cliente real acharia por acaso — e não substitui os primeiros
clientes de verdade. É por isso que a fase 7 existe.

---

### Fase 3 — As dívidas que bloqueiam o deploy

O `main` carrega três mudanças que **mudam comportamento no dia do deploy**. Nenhuma pode
subir sem o que está aqui.

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 3.1 | **Rodar o eval de Muse Spark 1.3 contra Luna** — agora possível, com a `META_API_KEY`. Métrica é **conversão e taxa de recusa de gate**, nunca Intelligence Index. Corpus: as 300 conversas do harness determinístico + as doze personas da fase 2. | agente | Uma tabela com os dois modelos lado a lado nas duas métricas, e um veredito escrito. O ponto fraco a medir com nome: alinhamento de segurança da Meta em atendimento comercial. |
| 3.2 | **Escrever a saída C no gate `price_promise`.** A economia de R$ 12,99 só é citável junto da ressalva de frete. Decisão do operador nesta sessão: o frete **vai** ser parametrizado, então a ressalva precisa existir **antes** do secret mudar. | agente | Três casos de teste: a frase com ressalva passa, a frase sem ressalva é vetada, e a ressalva burocrática ("valor sujeito a cálculo") não vira a única saída possível. Espelhado em `supabase/functions/turn/guardrails.ts`. |
| 3.3 | **Unificar `conversationCapBrl` — são três números, não dois.** 1,5 em `config/business.example.json` (decisão R10.1, de 21/09) · 0,8 no fallback da Edge Function e no harness de dev · 0,50 no raciocínio de escolha de modelo do `HANDOFF.md`, o mais antigo dos três. | agente + operador | Um número só, com a conta escrita, e o fallback do código alinhado ao que o secret carrega. |
| 3.6 ✅ | **FEITO em 2026-09-22 (não deployado).** **Corrigir a contradição do system prompt.** Ele diz, no mesmo texto, *"Nunca ofereça desconto ali: os dois caminhos custam o mesmo"* e *"10% de desconto (R$ 116,91)"*; e declara *"O FRETE É GRÁTIS nos dois caminhos"* como texto fixo, sem ler `delivery.freeShipping` — que o gate `shipping_promise` lê. | agente | ✅ `prepayPriceLine()`, `prepayDiscountRule()` e `freightBriefing()` em `index.ts`; o prompt lê `prepayDiscountPercent` e `freeShipping` com o mesmo teste `!== false` do gate. Os quatro comandos canônicos verdes (2824 testes). Falta deployar — ver R11.9. |
| 3.7 ✅ | **FEITO em 2026-09-22 (não deployado).** **Instrumentar o estágio do funil.** | agente | ✅ `0006_funnel_and_outcome.sql` converte as linhas `'discovery'`, troca o default para `'novo'` e adiciona `check` contra os dez `STAGES` mais índice. `state-machine.ts` ganhou `rankOf`/`furthest` (sem regressão, com salto de mais de um degrau) e virou o **nono espelho**, preso pelo drift test. O handler escreve o estágio em toda saída. **Falta:** aplicar a migração e deployar. |
| 3.8 ✅ | **FEITO em 2026-09-22 (não deployado).** **Instrumentar o desfecho do turno.** | agente | ✅ Tabela `turn_outcomes` (conversa, desfecho, motivo, reescritas, custo) na mesma migração — tabela própria porque `deferred` e `stopped` não produzem mensagem. As **oito** saídas do turno gravam: `send`, `fallback`, `deferred`, `handoff` (quatro portas), `stopped`, `opted_out`. **Falta:** aplicar a migração e deployar. |
| 3.4 | **Varrer os documentos de negócio** atrás de "frete grátis nos dois", "preço único" e "R$ 129,90" como fato consolidado — Frente 4 item 8, nunca feito. | agente | `grep` executado nos três caminhos (`contexto-negocio/`, `06-script/`, `01-conhecimento/`) com cada ocorrência resolvida ou marcada como histórica. |
| 3.5 | **Decidir o `DEFAULT_CONVERSATION_MODEL` do deploy**, com o eval na mão. | operador | Uma frase do operador: sobe com Muse, ou sobe com `CONVERSATION_MODEL=gpt-5.6-luna` + o preço de Luna nas duas chaves. |

---

### Fase 4 — Coinzz e Logzz: o pedido, dos dois lados

O webhook real da Coinzz chegou. Isso fecha a metade que faltava.

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 4.1 | **Confirmar o mapeamento da Coinzz contra o payload real.** O da Logzz já saiu de payload real; o da Coinzz era o esperado. | agente + operador | Cada campo que `job: "order"` lê tem origem nomeada no JSON real. Campo que o payload não traz vira ausência tratada, não `undefined` silencioso. |
| 4.2 | **Resolver o `payment_method`.** `src/agent/coinzz.ts` recusa adivinhar entre `afterpay`, `bank_slip`, `credit_card` e `pix` — de propósito, porque o valor errado cria cobrança que a cliente não combinou. | operador | O operador confirma o valor no painel da Coinzz, e ele entra em `BUSINESS_CONFIG`, não no código. |
| 4.3 | **Um pedido sintético completo no caminho COD**, criado pela agente, até o checkout da Logzz. | agente | O pedido aparece na Logzz com o tamanho no complemento do agendamento e o `payment_method` certo. Cancelado logo depois. |
| 4.4 | **Um pedido sintético completo no caminho antecipado**, incluindo a região sem COD que o força. | agente | Idem, na Coinzz, com `prepayOfferHash` (`offkw47x`) e não o hash do COD. |
| 4.5 | **A régua de pós-pedido armada pelo webhook**, e a de silêncio desarmada. | agente | Query em `followups`: as quatro do pós-pedido armadas, as três de silêncio canceladas, no mesmo `conversation_id`. |
| 4.6 | **Cancelar um dos pedidos sintéticos e provar que a régua inteira morre.** | agente | Nenhum toque pendente sobra. Especificamente: `order_eve` não sai para quem cancelou. |
| 4.7 | **As três URLs de obrigado** no painel da Coinzz (AfterPay → `/obrigado`; PIX e Cartão → `/obrigado?pago=antecipado`). | operador | As três configuradas, verificadas por um checkout de teste. |
| 4.8 | **Revarrer a cobertura** (43 cidades × 5 tamanhos) e ver se as 22 praças e o M de Minas continuam onde estavam. | agente | Tabela atualizada em `07-cobertura/`, com São Paulo/G conferido **antes** de acreditar em qualquer negativo. |

---

### Fase 5 — O deploy v33

Só depois das fases 3 e 4. É o único momento em que produção muda.

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 5.1 | **Token novo da API de gerência do Supabase** (os dois PATs anteriores foram revogados). | operador | Token emitido, usado, e revogado ao fim do deploy. |
| 5.2 | **`pnpm test && pnpm typecheck && pnpm typecheck:function`** antes de empacotar. | agente | Os três verdes. `typecheck:function` é a única coisa que olha o arquivo que a produção executa. |
| 5.3 | **Deploy pela API de gerência**, dez arquivos do disco (`state-machine.ts` entrou em 22/09). Não pela ferramenta MCP — são 199 KB e não cabem. | agente | A versão nova aparece na listagem, e o diff de 1.1 volta vazio. |
| 5.4 | **Atualizar o `BUSINESS_CONFIG`** com o que as fases 3 e 4 decidiram (`prepayBrl`, `prepayDiscountPercent`, `payment_method`, e `freeShipping` **só** quando o frete existir na Coinzz). | operador | A sonda de 5.5 confirma os valores novos saindo pela boca da agente. |
| 5.5 | **Sonda pela porta de produção nos dois caminhos**, conferindo pelo **formato** da resposta, não pelo conteúdo — por minutos depois do deploy parte das requisições ainda cai no isolate antigo. | agente | R$ 129,90 e prazo de 1 a 3 dias no COD; R$ 116,91, 10% e "varia por região, em média 5 dias úteis" no antecipado; `bubbles` presente nos dois. |
| 5.6 | **Rodar as doze personas contra a v33.** | agente | Nenhuma regressão contra a rodada 2 da fase 2. |

---

### Fase 6 — O canal (WhatsApp Cloud API)

Bloqueada pelo token, que está sendo resolvido. **Tudo abaixo de 6.3 pode ser preparado
antes do token chegar** — e deve, para o token não virar gargalo.

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 6.1 | **Redigir os três templates** (`silence_2`, `silence_3`, `order_eve`) no formato que a Meta aprova, com os placeholders na ordem certa. | agente + operador | Os três textos escritos e revisados contra os gates — um template aprovado que viola `warranty_promise` é pior que nenhum. |
| 6.2 | **Submeter à aprovação da Meta.** | operador | Os três aprovados, com nome e idioma anotados. |
| 6.3 | **Declarar em `BUSINESS_CONFIG` sob `channel.templates`** — nome, idioma e **ordem dos placeholders**. Ausente bloqueia todo toque fora da janela de 24h, de propósito. | operador | A varredura da régua manda um toque fora da janela e ele sai como template, não como texto livre. |
| 6.4 | **Ligar o envio**: quem envia lê `bubbles` (texto e atraso já calculados) e chama `presenceRefreshes` para o "digitando". `firstReplyAt` é do relógio de quem envia. | agente | Uma mensagem chega no WhatsApp real com o ritmo em bolhas, não em bloco. |
| 6.5 | **Contadores de pacing.** O gate existe e a varredura não passa contador nenhum — eles pertencem ao canal. Retry por hora para o limite de horário; não reusar o adiamento do limite diário. | agente | O gate `pacing` recusa o toque number 2 do mesmo dia, com contador real. |
| 6.6 | **Atribuição de CTWA ponta a ponta**: um clique de anúncio vira `leads.source` com o `ctwaClid`. | agente + operador | Uma linha em `leads` com o `ctwaClid` de um clique real. |
| 6.7 | **Aquecer o número.** Número novo precisa de semanas de uso normal antes de tráfego pago. | operador | Semanas de calendário, não de código. É o item de maior prazo do plano inteiro — comece já. |

> **`silence_3` não sai enquanto o cupom não existir na Coinzz** — retorna `null` de
> propósito. Anunciar cupom sem destino é a promessa quebrada que este projeto decidiu
> nunca fazer. O template pode ser aprovado antes; o toque fica mudo até o cupom existir.

---

### Fase 7 — O ensaio geral, e o começo dos testes reais

| # | O quê | Dono | Fechou quando |
|---|---|---|---|
| 7.1 | **As doze personas pelo canal real**, do WhatsApp do operador para o número da agente. | operador + agente | As doze conversas acontecem no app, não em `curl`. É aqui que o ritmo, a janela de 24h e a entrega de template são provados de verdade. |
| 7.2 | **Um pedido real, de verdade, pago na porta.** | operador | O ciclo inteiro: anúncio → conversa → checkout → entrega → webhook → pós-pedido. |
| 7.3 | **Tráfego mínimo nas 22 praças com COD**, não nas 43. | operador | A cobertura de 4.8 vira segmentação de campanha. |
| 7.4 | **Ligar o Hermes** para ler as conversas reais e propor. Nunca publica sozinho. | agente | `hermes_proposals` recebe a primeira proposta, e o operador aprova ou recusa à mão. |

---

## Ordem de execução

Quatro ondas. Dentro de uma onda, os itens não colidem em arquivo nem em dependência —
podem ser despachados juntos, sob o
[protocolo de ondas paralelas](../../../.claude/rules/parallel-subagent-driven-development.md).

| Onda | Itens | Quem despacha | Bloqueia |
|---|---|---|---|
| **A** | 1.1–1.5 (verdade do estado) · 2.1–2.3 (personas e runner) · 6.1 (redigir templates) · 6.7 (aquecer o número — **comece hoje**) | `orchestrator` | tudo |
| **B** | 2.4–2.5 (rodar as personas) · 3.1–3.4 (eval, saída C, teto, varredura) · 4.1–4.2 (mapeamento Coinzz) | `orchestrator` | a onda C |
| **C** | 3.5 + 5.1–5.6 (deploy v33) · 4.3–4.8 (pedidos sintéticos, cobertura) | `orchestrator` | a onda D |
| **D** | 6.2–6.6 (canal) · 7.1–7.4 (testes reais) | operador, com o agente | — |

**O que não tem ordem:** 6.7 (aquecer o número) é a única tarefa cujo prazo é de calendário
e não de trabalho. Ela não bloqueia nenhuma outra e **todas as outras a bloqueiam se ela
começar tarde.** É a primeira linha da onda A por isso.

**Quem faz o quê**, pela tabela de especialistas do [`CLAUDE.md`](../../../CLAUDE.md):

| Fase | Especialistas |
|---|---|
| 1 | `backend-specialist` (diff da função), `technical-writer` (registrar) |
| 2 | `conversation-designer` (as personas), `test-engineer` (a rubrica), `backend-specialist` (o runner) |
| 3 | `model-cost-governor` (3.1, 3.3), `pricing-guardian` + `prompt-engineer` (3.2), `compliance-reviewer` (3.4) |
| 4 | `workflow-architect` (contrato do webhook), `backend-specialist` (mapeamento) |
| 5 | `backend-specialist`, `security-reviewer` (antes do deploy), `test-engineer` |
| 6 | `workflow-architect`, `conversation-designer` (texto dos templates), `compliance-reviewer` |
| 7 | operador; `technical-writer` fecha o handoff |

---

## Critério de saída

Os testes reais começam quando as sete linhas abaixo forem verdade **ao mesmo tempo**:

1. A v33 está no ar e o diff contra o `main` volta vazio.
2. As doze personas rodam pela porta de produção sem achado de classe "mentira" aberto.
3. Um pedido sintético fechou nos dois caminhos, com o `payment_method` confirmado em
   painel — não deduzido.
4. O webhook de venda das duas plataformas arma a régua de pós-pedido e desarma a de
   silêncio, provado por query.
5. O eval de Muse Spark tem veredito escrito, e o modelo que está no ar é o que o operador
   escolheu sabendo do resultado.
6. Os três templates estão aprovados na Meta e declarados em `BUSINESS_CONFIG`.
7. O número tem semanas de uso normal e o envio pela Cloud API entrega uma mensagem real
   em bolhas.

**O que não é critério de saída:** o Hermes, o cupom da Coinzz, os depoimentos, e o M nas
19 praças sem ele. Todos os quatro melhoram o funil; nenhum bloqueia o primeiro cliente.

---

## O que este plano não cobre

- **A onda A4 (Hermes + conversão de volta para o Meta).** Depende de conversas reais
  existirem. Entra depois de 7.2, não antes.
- **O estoque do M nas 19 praças.** Virou pergunta para a Logzz
  ("por que o M só existe no CD de Minas e quando chega aos outros"), não tarefa de código.
  A conduta já é a certa: a consulta nunca veta um tamanho.
- **A Express (`deliverySameDay`).** Não está de pé em nenhuma praça. `availability.ts` já
  não promete "hoje". Nada a fazer até a janela voltar.
- **Rotação de credenciais** (`service_role`, OpenAI, Gemini, tokens do Facebook). É
  higiene de segurança contínua, listada no `HANDOFF.md`, não uma fase.
