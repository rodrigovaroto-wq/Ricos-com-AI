# Análise da arquitetura proposta — closed loop, Evaluation Layer e Hermes

> Escrita em 2026-09-22, a pedido do operador, contra a proposta de arquitetura híbrida do
> guia *Arquiteturas de Agentes de IA* (11 arquétipos + a referência híbrida da página 3).
> **Resolvido em 2026-09-22.** O operador acolheu as recomendações deste documento, e elas
> viraram a [**rodada 11** do log de decisões](../../documentacao/decisoes/03-decisoes-tomadas.md#rodada-11--arquitetura-do-sistema-2026-09-22)
> — R11.1 a R11.11. Este arquivo continua sendo o **raciocínio** por trás delas: o log
> registra o quê, aqui está o porquê, com os contra-argumentos que foram pesados.
>
> **Uma exceção ao "nada foi implementado": o achado A foi corrigido** na mesma sessão, por
> decisão do operador — o system prompt passou a ler o config. Ver
> [R11.9](../../documentacao/decisoes/03-decisoes-tomadas.md#r119--o-system-prompt-passa-a-ler-o-config-corrigido-nesta-sessão).
> **Atualização da tarde de 22/09:** C e D também foram corrigidos e as migrações `0005` e `0006`
> aplicadas em produção. Só o achado B continua aberto — é o item **2.3** do
> [plano v2](02-plano-de-execucao-ate-os-testes-reais.md).
>
> Contexto de execução: [`02-plano-de-execucao-ate-os-testes-reais.md`](02-plano-de-execucao-ate-os-testes-reais.md).

## A resposta curta

**A metade de cima da proposta já é o sistema.** n8n orquestra, o LLM interpreta, o Supabase
guarda estado — isso está de pé, deployado e testado. A proposta não pede mudança nenhuma ali,
e concordar com ela não custa nada.

**A metade de baixo — Evaluation → Hermes → Sandbox → loop — não existe**, e a razão pela qual
ela não existe não é falta de arquitetura. É que **o sistema não grava o que seria avaliado.**

Quatro achados de código, encontrados ao escrever esta análise, provam isso melhor que
qualquer diagrama:

| # | Achado | Consequência |
|---|---|---|
| **A** ✅ | O system prompt **contradizia a si mesmo** sobre desconto, e hardcodava "O FRETE É GRÁTIS nos dois caminhos" sem ler `freeShipping` | No dia em que `freeShipping: false` subisse, o gate vetaria uma frase que o prompt **manda** escrever. **Corrigido em 22/09** — R11.9 |
| **B** | `conversationCapBrl` tem **três valores diferentes** no repositório: 1,5 · 0,8 · 0,50 | O teto de custo que a produção aplica não é o que o operador decidiu |
| **C** ✅ | `conversations.stage` nascia `'discovery'` — valor que **não existe** em `STAGES` — e **nunca era escrito** | Não existia funil. **Corrigido em 22/09** (migração `0006` + `furthest` + escrita em toda saída); falta aplicar e deployar |
| **D** ✅ | O desfecho do turno viajava no corpo HTTP e **nunca era persistido** | A taxa de fallback era irrecuperável. **Corrigido em 22/09** (tabela `turn_outcomes`); falta aplicar e deployar |

Os quatro têm a mesma forma: **o sistema decide bem e não registra a decisão.** Uma Evaluation
Layer construída sobre o schema de hoje mediria custo e gates, e seria cega a conversão, a
estágio e a fallback. Hermes lendo isso proporia melhorias a partir de evidência parcial — que
é pior que não propor.

**Recomendação em uma frase:** aceite a proposta, mas **parta-a em duas pelo tempo, não por
componente.** A instrumentação (C, D e o funil) precisa entrar **antes** do primeiro cliente
real, porque conversa que já aconteceu não se instrumenta depois. Evaluation, Hermes e o loop
entram **depois** que houver tráfego — antes disso não há amostra, e `hermes_proposals.leads_seen`
existe no schema justamente porque alguém já sabia disso.

---

## 1. Arquitetura atual — como o sistema realmente está

### O arquétipo, pelo vocabulário do próprio guia

O guia lista 11 arquétipos. O sistema de hoje é **o #2 (Workflow + LLM) com o #8
(Self-Reflective) já dentro**, e nada mais:

```
n8n (determinístico)  →  Edge Function `turn` (determinístico)
                              │
                              ├─ callGemini      → classifica intenção
                              ├─ callMuse/Luna   → escreve a resposta
                              ├─ runGates(19)    → veta
                              └─ se vetou: reescreve com o motivo, até o teto   ← #8
```

**O que isso significa, e é a coisa mais importante desta análise:** *não existe tool-calling
em produção.* O modelo **só escreve texto**. Toda ação — indicar tamanho, ler endereço, coletar
CPF, consultar cobertura, montar o link de checkout, agendar a régua — é TypeScript determinístico
**em volta** da chamada, não uma ferramenta que o modelo escolhe.

A especificação [`02-especificacao/02-tools-do-agente.md`](../02-especificacao/02-tools-do-agente.md)
descreve onze tools (`send_message`, `recommend_size`, `save_lead_fact`, …). **Nenhuma existe.**
Ela é proposta de escopo da rodada 2 e nunca foi adotada. Isso não é dívida: é uma decisão
implícita que funcionou, e que esta análise recomenda tornar explícita.

### As sete peças, e onde cada uma está

| Peça da proposta | No sistema hoje | Onde |
|---|---|---|
| **n8n — orquestração** | ✅ três workflows: turno (`HnGrxquQLpfbXWLH`), venda (`gS72LhYGOnmyALRq`), relógio (`SVDtFUi2N9oOskkx`) | fora do repositório |
| **LLM / Agente — inteligência** | ✅ dois modelos, dois papéis: Muse Spark 1.3 (conversa) e Gemini 3.5 Flash Lite (intenção, barato) | `supabase/functions/turn/index.ts:1454`, `:1632` |
| **Tools / APIs** | ⚠️ existem como **função TypeScript**, não como tool do modelo: `checkRegion`, `buildCoinzzRequest`, `buildCheckoutLink`, ViaCEP | `src/agent/availability.ts`, `src/agent/coinzz.ts` |
| **Supabase — dados/estado** | ✅ nove tabelas, retenção de 90 dias por cron | `supabase/migrations/0001_init.sql` |
| **Supabase — memória** | ⚠️ histórico sim (`messages`), fato durável não | ver §7 |
| **Supabase — RAG** | ❌ inexistente, **e desnecessário** | ver §7 |
| **Evaluation Layer** | ⚠️ **sinais crus sim, métrica nenhuma** | `gate_traces`, `llm_calls` |
| **Hermes — supervisor** | ❌ só a tabela `hermes_proposals`. Zero linha de código | `0001_init.sql:116` |
| **Sandbox / validação** | ✅ **a peça mais forte do sistema** | ver abaixo |
| **Closed loop** | ❌ inexistente | — |

### O Sandbox já existe, e é melhor do que a proposta pede

Isto merece ser dito com todas as letras, porque a proposta o trata como caixa a construir:

- **2802 testes** unitários, verdes no CI;
- **300 conversas completas** (60 arcos × 5 personas), rodadas por `pnpm dev:conversas` — não
  um script que ninguém roda: o CI roda;
- **`tests/function-drift.test.ts`** — prova byte a byte que os oito arquivos espelhados e as
  duas cópias *inline* não divergiram. Isto é verificação de integridade de deploy, e poucos
  sistemas deste tamanho têm;
- **`pnpm typecheck:function`** (`deno check`) — a única coisa que olha o arquivo que a produção
  executa de verdade;
- **doze personas dirigidas por modelo**, especificadas em
  [`03-personas-de-teste-interno.md`](03-personas-de-teste-interno.md), ainda por construir.

O Sandbox da proposta **não precisa ser construído. Precisa ser apontado.** Ele é o CI deste
repositório.

---

## 2. Arquitetura proposta — como eu a entendo

A proposta é a referência híbrida da página 3 do guia, aplicada a este projeto. Ela faz duas
afirmações, e elas têm qualidade muito diferente:

**Afirmação 1 — a separação de responsabilidades.** Determinístico no n8n, inteligência no
LLM, estado no Supabase. Isto **não é uma proposta nova**: é literalmente a regra que o
`CLAUDE.md` já fixa — *"regra de negócio é código versionado com teste; credencial, relógio e
chamada HTTP são cano"*. A proposta concorda com o sistema. Aceitar custa zero.

Uma divergência de detalhe, a favor do sistema atual: a proposta põe **"regras" dentro do n8n**.
Este projeto deliberadamente **não** faz isso — guardrail, máquina de estados e teto de custo
são código versionado com teste, e o n8n não guarda regra de negócio. Manter como está.

**Afirmação 2 — o closed loop.** Executar → registrar → avaliar → detectar → propor → testar →
validar → implementar. Isto **é** novo, é o arquétipo #10 do guia, e é onde toda a análise
interessante mora.

O próprio guia é honesto sobre o custo do #10: *"Muito mais complexo · Precisa de métricas e
testes confiáveis"*, e recomenda-o para *"sistemas críticos ou complexos que precisam evoluir
continuamente com evidência objetiva"*. A pergunta certa não é "o loop é bom?" — é **"este
sistema tem métricas confiáveis?"**. Hoje não tem. É o que §6 mede.

---

## 3. Gap Analysis

### Já existe, com outro nome

| Proposta | Nome real aqui |
|---|---|
| Orquestração determinística | os três workflows n8n, mais a própria Edge Function |
| Inteligência / decisão | `callMuse` + `callGemini`, com roteamento por família de modelo |
| Self-reflection | **o loop de reescrita** (`index.ts:1639-1700`): o gate veta, o motivo volta ao modelo no system prompt, ele reescreve. O texto vetado nunca entra no histórico |
| Tools | funções TypeScript determinísticas, chamadas pela função e não pelo modelo |
| Estado / histórico | `leads`, `conversations`, `messages`, `orders`, `followups` |
| Sinal de qualidade | `gate_traces` (gate, veredito, detalhe, por tentativa — **não só a última**) |
| Sinal de custo | `llm_calls` (provider, model, tokens, `cost_brl`, `latency_ms`) |
| Sandbox | o CI: 2802 testes, 300 conversas, drift, `deno check` |
| Fila / retry | `jobs` + `claim_jobs()` — claim atômico com `for update skip locked`, sem Redis |

### Falta de verdade

| Falta | Gravidade | Por quê |
|---|---|---|
| **Funil persistido** (achado C) | **alta** | `conversations.stage` nasce `'discovery'` — valor fora de `STAGES` — e nunca é escrito. Não existe "quantas chegaram em `tamanho_definido`" |
| **Desfecho do turno persistido** (achado D) | **alta** | `fallback`, `deferred`, `handoff`, `stopped` só existem no corpo HTTP. A taxa de fallback é irrecuperável |
| Ligação toque → resposta | média | `followups.sent_at` existe; nada diz se a cliente respondeu depois. Sem isso não se mede se a régua funciona |
| Métrica agregada | média | Nenhuma view, nenhum job, ninguém lê `gate_traces` |
| Hermes | média | Só a tabela. E **não deve ser construído antes de haver tráfego** |
| Fato durável do lead | baixa | O medo declarado, o evento, a restrição — o `save_lead_fact` da spec. Hoje some no histórico |
| RAG | **nenhuma** | Ver §7: não é lacuna, é decisão de não fazer |

### Precisa ser alterado

1. **O system prompt precisa ler o config** (achado A). Hoje ele diz, no mesmo texto:
   *"Nunca ofereça desconto ali: os dois caminhos custam o mesmo"* (linha 558) **e**
   *"Quem prefere pagar antes leva 10% de desconto (R$ 116,91)"* (linha 574). E declara
   *"O FRETE É GRÁTIS nos dois caminhos"* (linha 577) como texto fixo, sem ler
   `delivery.freeShipping` — que o gate `shipping_promise` **lê** (`guardrails.ts:817,834`).
   Isto é exatamente a violação de separação que a proposta quer corrigir: **regra de negócio
   vazou para dentro do texto do prompt.** É bug antes de ser arquitetura.
2. **`conversationCapBrl` precisa de um número só** (achado B): 1,5 em
   `config/business.example.json` (decisão R10.1, de 21/09), 0,8 no fallback da Edge Function
   e no harness de dev, 0,50 no raciocínio de escolha de modelo do `HANDOFF.md`. O item 2.3 do
   plano de execução dizia "dois números"; são três, e o de 0,50 é o mais antigo.
3. **A spec de tools precisa de veredito.** Ou é marcada como não adotada, ou é adotada de
   propósito. Spec fantasma confunde a próxima sessão — foi o que aconteceu aqui.

---

## 4. Benefícios — que problema concreto isso resolve

Três reais, e um que a proposta promete e este projeto não colhe.

**Real 1 — a contradição do prompt teria sido achada por métrica, não por leitura.** O achado
A ficaria visível em uma linha de SQL: `shipping_promise` bloqueando uma fração alta das
tentativas. Hoje `gate_traces` já grava isso **e ninguém olha**. Este é o argumento mais forte
a favor da Evaluation Layer, e ele é empírico: a camada teria pego o defeito que três sessões
de leitura não pegaram.

**Real 2 — o custo do loop de reescrita é invisível.** Cada reescrita é uma chamada de modelo
a mais, gravada em `llm_calls` com `purpose='rewrite'`. Um gate que dispara demais **é um
imposto por conversa**, e hoje ninguém sabe o tamanho do imposto.

**Real 3 — o Hermes deixa de ser uma caixa de "otimizador" e vira uma função com entrada
definida.** Hoje `hermes_proposals` tem uma coluna `evidence jsonb` e nada define o que entra
nela. Uma Evaluation Layer define.

**Não colhido — "evolução contínua".** Esse é o benefício que o guia vende no #10, e ele
pressupõe volume. Este funil não tem tráfego nenhum ainda. Prometer evolução contínua antes do
primeiro cliente é construir a engrenagem antes da matéria-prima.

---

## 5. Riscos — o que a proposta pode introduzir

| Risco | Tamanho | Por quê |
|---|---|---|
| **Hermes dentro do turno** | **alto** | Seria uma terceira chamada de modelo por turno, num funil cujo teto é R$ 1,50 por conversa e cujo ritmo de resposta é calculado em milissegundos (`pacing.ts`). Latência e custo, sem ganho. **A proposta acerta ao tirá-lo dali** |
| **RAG** | **alto** | O guia lista o contra: *"recuperação pode falhar"*. Trocar um prompt determinístico e testado por uma recuperação que pode falhar, para uma base de 104 linhas, é regressão disfarçada de modernização |
| **Um "serviço" de Evaluation** | médio | A tentação é um processo novo. Não é: são views SQL e um job. Serviço novo = deploy novo, credencial nova, coisa nova pra cair |
| **Sandbox paralelo ao CI** | médio | Se o Sandbox não for literalmente `pnpm test && pnpm dev:conversas && pnpm typecheck:function`, viram duas verdades e uma delas fica desatualizada. O repositório já tem esse ferimento: a spec de tools |
| **Confundir os 12 especialistas do Claude Code com multi-agent de runtime** | médio | `.claude/agents/` é time de **desenvolvimento**. Nada ali roda em produção. O guia tem os arquétipos #4/#5/#11 e eles são sedutores — **nenhum se aplica ao runtime deste projeto** |
| **Métrica antes de amostra** | médio | Com 30 conversas, toda taxa é ruído. `hermes_proposals.leads_seen` existe pra isso; respeitá-lo é ter um piso de amostra escrito antes de olhar o primeiro número |
| **Auto-aplicação de melhoria** | **alto** | Ver §8. Cada gate existe por causa de uma promessa que a operação não cumpre — LGPD, CDC, anúncio com apelo de corpo. Mudança de prompt aplicada sozinha é exposição real |

---

## 6. Evaluation Layer — o que dá para medir hoje, e o que falta

### Mede hoje, sem escrever uma linha de instrumentação

Tudo abaixo sai de `gate_traces`, `llm_calls`, `messages`, `orders` e `followups` com SQL puro:

| Métrica | Fonte | Para que serve |
|---|---|---|
| Taxa de bloqueio **por gate** | `gate_traces.verdict='block'` agrupado por `gate` | Gate que dispara demais é problema de prompt, não de cliente. **Teria pego o achado A** |
| Reescritas por resposta enviada | `llm_calls.purpose='rewrite'` ÷ `purpose='reply'` | O imposto do loop de reescrita, em número |
| Custo por conversa e por lead | `llm_calls.cost_brl`, `conversations.cost_brl` | Contra o teto — depois que o teto for um número só (achado B) |
| Latência por chamada | `llm_calls.latency_ms` | Resposta lenta em WhatsApp é venda perdida |
| Taxa de handoff | `leads.handoff_at` não nulo | Handoff alto = agente incapaz, ou modelo caindo |
| Opt-out | `leads.opted_out_at` | O erro irreversível. Tem que ser perto de zero |
| Conversão bruta | `orders` ÷ `leads` | A única métrica que o operador realmente compra |
| Mix COD × antecipado | `orders.payment_method` | Se o antecipado passar de saída a opção, o script quebrou |
| Toques enviados vs cancelados | `followups.status` | Se a régua está armando e desarmando certo |

### Não mede hoje, e precisa de escrita nova

| Sinal | O que falta | Custo |
|---|---|---|
| **Estágio do funil** | Escrever `conversations.stage` a cada transição, com os valores de `STAGES`, e corrigir o default `'discovery'` que não existe na lista | uma migração + escrita no handler |
| **Desfecho do turno** | Persistir `send` · `fallback` · `deferred` · `handoff` · `stopped` — hoje só volta no corpo | coluna em `messages` ou tabela `turns` |
| **Motivo do fallback** | `outcome.reason` existe em runtime e morre ali | mesma escrita |
| **Toque → resposta** | Marcar se houve inbound depois de um `followups.sent_at` | derivável por SQL se o desfecho existir |
| **Conversão por persona/objeção** | Rotular a conversa pela objeção dominante | só faz sentido com tráfego; **não construir agora** |

### A ordem que importa

**A instrumentação (estágio e desfecho) precisa existir antes do primeiro cliente real.**
Conversa que já aconteceu não se instrumenta depois. As views e o Hermes podem esperar — elas
leem o passado. A escrita, não.

Isto muda o plano de execução: **os dois itens de instrumentação entram na fase 3**, antes do
deploy v33, e não numa fase futura de "observabilidade".

---

## 7. Supabase como dados, memória e RAG

### Dados e estado — já está certo

Nove tabelas, chaves estrangeiras com `on delete cascade`, `expires_at` em todas as que
guardam dado de cliente, `purge_expired()` por cron (retenção de 90 dias, R6.3 — exigência de
LGPD, não escolha de engenharia). Nada a mudar.

### Memória — uma lacuna pequena e real

O que falta não é vetor. É que **o fato durável do lead não sobrevive ao histórico**: o medo
que ela declarou, o evento pelo qual ela quer o produto ("casamento no sábado"), a restrição
que ela mencionou. Hoje isso vive em `messages` e morre quando a janela de contexto trunca.

A spec de tools já tinha visto isso e chamou de `save_lead_fact`. A implementação certa é
**uma coluna `jsonb` em `leads`**, escrita pelo extrator determinístico que já existe para
tamanho e endereço — não um serviço de memória, não um índice, não um agente.

Custo: uma migração e um extrator. Benefício: a agente para de perguntar duas vezes a mesma
coisa, que é o atrito nº 1 da rubrica das personas.

### RAG — a recomendação é **não fazer**

Três razões, em ordem de peso:

1. **A base de conhecimento tem 104 linhas.** Ela cabe no system prompt e **já está nele**.
   RAG resolve conhecimento que não cabe no contexto; este cabe com folga.
2. **RAG introduz um modo de falha que hoje não existe.** O próprio guia lista:
   *"recuperação pode falhar"*. Numa arquitetura cuja tese inteira é "determinístico onde der",
   trocar texto fixo e testado por recuperação probabilística é andar para trás.
3. **Se a base crescer, a resposta não é RAG — é o matcher determinístico** que a própria spec
   de tools já propôs como *"alternativa mais barata: matcher determinístico injetando a skill
   certa, sem busca"*. Ele é testável, e RAG não é testável do jeito que este repositório testa.

**Quando reabrir:** se a base passar de ~2000 linhas, ou se o catálogo deixar de ser um produto
só. Nenhuma das duas está no horizonte.

---

## 8. O closed loop — o que dá para automatizar com segurança

Quebrando o loop em seis passos, cada um com veredito próprio:

| Passo | Automatizar? | Por quê |
|---|---|---|
| **Executar** | ✅ já é | É a Edge Function |
| **Registrar** | ✅ **sim, e é a prioridade** | Achados C e D. Escrita nova, determinística, sem modelo |
| **Avaliar** | ✅ sim | Views SQL + um job. Determinístico, custo zero, sem modelo |
| **Detectar problema** | ✅ sim, **com piso de amostra** | Limiar sobre as views. `leads_seen` é o piso, escrito antes de olhar o número |
| **Propor melhoria** | ✅ sim — é o Hermes | Uma chamada de modelo **em lote, offline**, lendo as views. Escreve em `hermes_proposals` com `evidence` e `leads_seen`. Nunca no caminho do turno |
| **Testar em sandbox** | ✅ sim | Já existe: CI + 300 conversas + as 12 personas |
| **Validar e implementar** | ❌ **nunca** | Ver abaixo |

### Por que a implementação nunca se automatiza neste projeto

Três razões, e a terceira é estrutural:

1. **Exposição regulatória real.** O produto tem apelo de corpo e saúde; a venda é COD, com
   direito de arrependimento do CDC; o dado é pessoal, com LGPD. Cada um dos 19 gates existe
   por causa de uma promessa que custa dinheiro ou expõe a operação. Uma mudança de prompt
   aplicada sozinha é essa exposição sem ninguém no meio.
2. **O histórico deste repositório.** `freeShipping` foi criado com 2738 testes verdes e o
   deploy dado como concluído — e reinstalou um veto em produção porque o `??` do
   `BUSINESS_CONFIG` é sobre a variável inteira. Testes verdes já não bastaram aqui.
3. **A arquitetura já bloqueia isso fisicamente, e isso é uma qualidade.** O `BUSINESS_CONFIG`
   é um secret **que só o operador consegue escrever** — não é legível nem gravável pela API de
   gerência. Um Hermes automático não conseguiria aplicar mudança de config nem se quisesse.
   **Não remova essa barreira para viabilizar o loop.** Ela é o desenho certo.

**A forma certa do último passo:** Hermes propõe → o Sandbox roda sozinho → a proposta vira um
**pull request** (ou uma linha em `hermes_proposals` com `status='proposed'`) → o operador
aceita ou recusa. O loop fecha em um humano, de propósito, e continua sendo um loop.

---

## 9. Onde isto vira overengineering

Cinco lugares, do mais provável ao menos:

1. **Construir o Hermes antes de existir tráfego.** É o erro mais caro, e o mais fácil de
   cometer porque a tabela já existe e convida. Hermes com 30 conversas produz ruído com cara
   de recomendação. **Espere a fase 7 do plano.**
2. **RAG.** Ver §7. Alto custo, risco novo, zero ganho no tamanho atual da base.
3. **Um serviço separado de Evaluation.** São views e um cron. Um processo novo é uma coisa
   nova pra cair, uma credencial nova pra rotacionar, um deploy novo pra divergir do repositório
   — e divergência de deploy já é uma memória registrada aqui.
4. **Tool-calling para a conversa.** Tentador porque a spec existe e porque "agente de verdade
   usa tools". Trocaria código determinístico e testado por escolha do modelo, num funil cuja
   falha típica é uma promessa que custa o frete inteiro. O guia diz isso melhor:
   *"não use mais agentes por parecer mais avançado; use autonomia apenas onde ela produz ganho
   mensurável."*
5. **Multi-agent ou hierárquico no runtime** (#4, #5, #11 do guia). Não há problema grande e
   divisível aqui. Há uma conversa de vendas, curta, com 19 regras. Os 12 especialistas de
   `.claude/agents/` são time de desenvolvimento e **não rodam em produção** — confundir os dois
   é o caminho mais rápido para triplicar o custo por lead.

---

## 10. Arquitetura recomendada

A proposta, com quatro emendas. As emendas são o que muda; o resto é aceitar.

```
                 CLIENTE / EVENTO (WhatsApp Cloud API · Meta Ads/CTWA)
                                    ↓
              ┌────────────────────────────────────────────┐
              │  n8n — CANO E RELÓGIO                      │
              │  webhook · Wait de 2min · cron 5min ·      │
              │  retry · e-mail de handoff e de recusa     │
              │  ⚠ NÃO guarda regra de negócio             │
              └────────────────────┬───────────────────────┘
                                   ↓
              ┌────────────────────────────────────────────┐
              │  EDGE FUNCTION `turn` — O CÉREBRO          │
              │  Workflow + LLM + auto-reflexão            │
              │                                            │
              │  intenção (Gemini) → resposta (Muse) →     │
              │  19 gates → se vetou, reescreve com o      │
              │  motivo → teto de custo → envia            │
              │                                            │
              │  ⚠ sem tool-calling, de propósito:         │
              │  toda ação é TypeScript determinístico     │
              └──┬──────────────────┬──────────────────┬───┘
                 ↓                  ↓                  ↓
      ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐
      │ SUPABASE         │ │ AÇÕES          │ │ INSTRUMENTAÇÃO   │
      │ estado · histó-  │ │ determinísticas│ │ ★ A EMENDA 1     │
      │ rico · fatos do  │ │ tamanho ·      │ │ stage · desfecho │
      │ lead (jsonb) ★2  │ │ endereço · CEP │ │ · motivo do      │
      │ ⚠ sem RAG        │ │ · cobertura ·  │ │ fallback         │
      │                  │ │ checkout       │ │ gate_traces ·    │
      └──────────────────┘ └────────────────┘ │ llm_calls        │
                                              └────────┬─────────┘
                                                       ↓
                                    ┌──────────────────────────────┐
                                    │ EVALUATION — views SQL + job │
                                    │ ★ EMENDA 3: não é serviço    │
                                    │ bloqueio/gate · reescritas · │
                                    │ custo · funil · conversão    │
                                    └──────────────┬───────────────┘
                                                   ↓  (só com amostra:
                                                   │   leads_seen ≥ piso)
                                    ┌──────────────────────────────┐
                                    │ HERMES — supervisor OFFLINE  │
                                    │ lote, nunca no turno         │
                                    │ → hermes_proposals           │
                                    └──────────────┬───────────────┘
                                                   ↓
                                    ┌──────────────────────────────┐
                                    │ SANDBOX = O CI DESTE REPO    │
                                    │ ★ EMENDA 4: não construir    │
                                    │ 2802 testes · 300 conversas ·│
                                    │ 12 personas · drift · deno   │
                                    └──────────────┬───────────────┘
                                                   ↓
                                         OPERADOR APROVA  ← humano, sempre
                                                   ↓
                                             deploy / secret
```

### As quatro emendas, explicadas

**★ Emenda 1 — instrumentação é uma camada própria, e vem primeiro.** A proposta trata
"registrar" como algo que já acontece. Não acontece: estágio e desfecho não são gravados
(achados C e D). Esta é a única parte da metade de baixo que precisa entrar **antes** do
primeiro cliente, porque é a única que escreve.

**★ Emenda 2 — memória é uma coluna `jsonb`, não uma camada.** Fato durável do lead em
`leads`, escrito pelo extrator determinístico que já existe. Sem vetores, sem RAG, sem serviço.

**★ Emenda 3 — Evaluation são views SQL e um job, não um serviço.** Determinístico, custo zero,
sem modelo, sem deploy novo. Se um dia precisar de um rosto, é uma página estática como as duas
que já existem em `docs/operacao/`.

**★ Emenda 4 — o Sandbox já existe.** É `pnpm test && pnpm dev:conversas && pnpm typecheck:function`
mais as doze personas. Não construa outro; aponte para este.

### O que permanece igual à proposta

A separação n8n / LLM / Supabase, o Hermes como supervisor e não como componente de turno, e o
formato do loop. Nisso a proposta está certa e o sistema já concorda.

### O que eu recuso da proposta

**"Regras" dentro do n8n.** O diagrama lista `regras` na caixa do n8n. Este projeto decidiu o
contrário, com motivo escrito, e a decisão é boa: guardrail, máquina de estados e teto de custo
são código versionado com teste. O n8n não os recebe.

---

## Próximos passos, em ordem de prioridade

**Não implementado. Ordem proposta, para o operador aprovar.**

### Antes do deploy v33 — fase 2 do plano v2

1. **Corrigir a contradição do system prompt** (achado A). O prompt lê `freeShipping` e para de
   dizer ao mesmo tempo "nunca ofereça desconto" e "10% de desconto". É bug em produção
   esperando o dia do `freeShipping: false`, não refatoração. Junta com o item 2.2 do plano v2
   (a saída C do `price_promise`), porque os dois mexem na mesma promessa.
2. **Unificar `conversationCapBrl`** (achado B). Três números viram um. É o item 2.3 do
   plano, que estava sub-informado.
3. **Instrumentar o estágio** (achado C): escrever `conversations.stage` com os valores de
   `STAGES` a cada transição, e corrigir o default `'discovery'`.
4. **Instrumentar o desfecho do turno** (achado D): persistir `send`/`fallback`/`deferred`/
   `handoff`/`stopped` mais o motivo do fallback.

> 3 e 4 são a única parte desta análise que é **urgente por prazo**: conversa que já aconteceu
> não se instrumenta depois, e a fase 7 do plano começa a gerar conversas reais.

### Depois do deploy, antes do tráfego

5. **Dar veredito à spec de tools** — adotada ou não adotada, escrito no arquivo. Custa dez
   minutos e evita a próxima sessão implementar onze tools que ninguém pediu.
6. **Fato durável do lead** (emenda 2): coluna `jsonb` em `leads` mais o extrator. Reduz o
   atrito que as personas vão medir.

### Depois que houver tráfego real — não antes

7. **As views de Evaluation** (emenda 3). Começar pela taxa de bloqueio por gate e pelo custo
   de reescrita: são as duas que já têm dado hoje.
8. **O piso de amostra**, escrito antes de olhar o primeiro número (`leads_seen`).
9. **O Hermes**, offline, em lote, escrevendo em `hermes_proposals`.
10. **Fechar o loop no operador** — proposta → sandbox automático → aprovação humana → deploy.
    **Nunca aplicação automática.**

### O que não fazer

- **RAG** (§7).
- **Tool-calling para a conversa** (§9.4).
- **Hermes dentro do turno** (§5).
- **Um serviço de Evaluation** (§9.3).
- **Remover a barreira do secret** para viabilizar auto-aplicação (§8.3).
