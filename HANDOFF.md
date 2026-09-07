# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive **todo** o
> contexto do projeto — negócio, pesquisa, especificação, decisões — e onde o
> agente de IA de vendas via WhatsApp está sendo construído. O outro
> repositório, `colet-cinta-modeladora` (renomeado para **Encorpa-Website**),
> guarda só o site oficial da Encorpa (landing page, checkout) e um
> `HANDOFF.md` resumido específico dele. Se um dia os dois divergirem sobre
> negócio, **este repositório é a fonte**.

> Atualizado em: 2026-09-07

---

## Em uma frase

O agente saiu do papel: onda A0 e metade da A3 rodam em produção contra o banco
real, com uma conversa completa (turno + guardrails + custo), as duas réguas de
acompanhamento por cron e — o que mudou nesta sessão — **um guardrail que barra
já não vira silêncio nem tarefa do operador: a agente reescreve a própria
resposta, ou guarda a resposta certa para a janela reabrir**. Tudo isso **sem
número de WhatsApp**, contra um contrato de canal que o WAHA vai preencher
quando o número existir.

---

## Onde o trabalho parou

**Edge Function `turn` na versão 12, deployada e verificada em produção.**
148 testes, `tsc --noEmit` e `deno check` verdes. O que resta de bloqueante não
é código: é o número de WhatsApp.

### O que esta sessão entregou

1. **R8.4 fechada** — o recomendador de tamanho determinístico passou a ser
   chamado pela Edge Function, verificado em produção. Seção dedicada abaixo.
2. **`leads.size` passou a ser gravado** — nada escrevia nele, e a régua de
   pós-pedido saía com "Colete tamanho **—**" para a cliente ler.
3. **Extrator de endereço** (`src/agent/address.ts`, §D2) — pronto e testado,
   **ainda não ligado à conversa** de propósito (ver "o que falta para a A3").
4. **Contrato de checkout da Coinzz** (`src/order/checkout.ts`, §E1/§E2) —
   formato escrito, mock no lugar da credencial, idempotência testada.
5. **Autocorreção no lugar de handoff** — os cinco tópicos do plano, fechados e
   deployados. Seção dedicada logo abaixo.
6. **Quatro defeitos que só a execução contra produção pegou**, todos
   corrigidos e travados em teste. Seção dedicada mais abaixo.

### Autocorreção no lugar de handoff — os cinco tópicos, fechados

A diretriz do operador: quando um guardrail barra, o sistema **não** passa a
responsabilidade da resposta para ele. Ele analisa o veto, se corrige e segue,
sem deixar a cliente sem resposta.

1. **Classificação dos gates.** Cada um dos onze declara a própria classe de
   remediação — **reescrever** (8), **adiar** (2: `business_hours`, `pacing`),
   **parar** (1: `opt_out`). `remedyFor` devolve a mais estrita quando mais de
   um barra, com `SEVERITY = { defer: 0, rewrite: 1, stop: 2 }`: o conteúdo é
   corrigido **antes** de o relógio ser respeitado, e opt-out vence tudo.
2. **Laço de reescrita.** Veto → motivo e texto vetado voltam ao modelo pelo
   **system prompt** (nunca pelo histórico, para não sujar o próximo turno) →
   nova tentativa → cadeia de novo. Máximo **2 reescritas**, com o teto de custo
   da conversa checado antes de cada uma. Toda tentativa vai para `gate_traces`:
   gate que insiste entre reescritas é problema de prompt, matéria-prima do
   Hermes, não deste laço.
3. **Adiamento real.** `followups.body` guarda a resposta já escrita e
   `nextOpening` marca a reabertura da janela; o cron existente reenvia, e a
   cadeia roda **de novo** na hora do envio. Depois de um envio adiado a régua
   de silêncio é reiniciada — senão a cliente ficaria sem os toques seguintes.
4. **Resposta de espera + notificação.** `HOLDING_REPLY` e
   `HUMAN_HANDOFF_REPLY` passam na cadeia inteira **por construção**, com teste;
   o payload de handoff leva e-mail, `leadId`, telefone e `conversationId`.
5. **Sentinela de pedido de humano (§Q12).** Determinística, roda **antes** de
   qualquer chamada de modelo — pedir atendente não custa um centavo de modelo.

**Verificado na v12**, contra o Supabase real: pedido de humano vira handoff sem
gastar chamada de modelo; a cliente já em handoff não é respondida por cima do
humano; o adiamento agenda para 06:00 de **Brasília** (`runAt` 09:00Z); e o laço
foi exercitado ponta a ponta com `rewrites: 2` → resposta de espera → payload de
notificação. As linhas de teste foram apagadas depois.

### Os quatro defeitos que só produção pegou

Nenhum destes apareceu lendo código. Todos apareceram **rodando a coisa real com
sondas baratas** — é a prática que vale a pena repetir na próxima sessão.

**1. Idade virando manequim.** Ao ligar a gravação do `leads.size`, a primeira
versão só gravava quando o classificador barato dizia `TAMANHO`. Em produção,
"tenho 44 anos, esse colete serve pra mim?" foi classificado como `TAMANHO` — e
com razão — e o banco gravou **G** para uma cliente de 44 anos. Corrigido
tirando o classificador do caminho; seção dedicada abaixo.

**2. `ON CONFLICT` contra índice parcial.** A migração da resposta adiada trocou
a `unique (conversation_id, kind)` de `followups` por um índice único
**parcial**, para permitir várias respostas adiadas por conversa. O handler faz
upsert com `on_conflict=conversation_id,kind`, e o Postgres recusa `ON CONFLICT`
contra índice parcial (`42P10`). Pior: a chamada é `.catch(() => undefined)` — o
turno seguiria respondendo e a régua de silêncio simplesmente pararia de
agendar, sem erro visível, por dias. Revertido em minutos. A decisão final é
manter a unicidade total: a resposta adiada mais nova substitui a anterior, que
é a pergunta viva quando a janela reabre. Registrado em
[`.claude/memory/on-conflict-partial-index.md`](.claude/memory/on-conflict-partial-index.md)
e como aviso dentro da própria migração.

**3. `SEVERITY` invertida** (regressão minha, entrou no PR #10 e saiu no #11).
`defer` vencia `rewrite`, então uma resposta de madrugada com preço errado era
guardada sem correção, re-gateada ao amanhecer, barrada de novo e **cancelada**
— sem mensagem, sem handoff, sem ninguém avisado. `defer` não é um veredito mais
duro, é um **mais tarde**. Travado por teste em `tests/remedy.test.ts`.

**4. Cegueira a negação em quatro gates.** A cliente pediu 30% de desconto, a
agente respondeu **"Não consigo oferecer 30% de desconto"** — a resposta certa —
e o `price_promise` vetou, porque o texto contém "30%" perto de "desconto". Duas
reescritas queimadas e handoff, para um turno acertado de primeira: R$ 0,0045 em
vez de R$ 0,0015. A varredura achou mais três, todos confirmados barrando ao
vivo:

| Gate | Frase honesta que era vetada |
|---|---|
| `price_promise` | "Não consigo oferecer 30% de desconto" |
| `delivery_promise` | "Não consigo entregar amanhã, a entrega leva de 3 a 5 dias" |
| `humanity_claim` | "**Não sou uma pessoa, sou a assistente virtual**" — a frase que o próprio system prompt exige |
| `coupon_exists` | "Não temos cupom no momento" |

O `humanity_claim` era o pior: a agente não conseguia responder **"você é um
robô?"**, a pergunta mais previsível que ela vai receber. A correção extraiu o
`negatedAt` que já existia dentro do `weight_loss_claim` e o aplicou aos quatro
— um termo só conta como infração quando não está negado na própria oração. Duas
exceções ficam de fora de propósito: negar ser robô (`"não sou um robô"`)
**continua barrado**, porque ali a negação é a própria infração; e a negação não
atravessa fronteira de frase, então `"Não temos frete grátis: hoje sai por
R$ 99,90"` continua barrado.

> **Decisão de produto aguardando veto do operador:** liberar `"não temos
> cupom"` muda o que a agente pode dizer sobre promoção. O gate existe para ela
> nunca anunciar cupom que não existe na Coinzz, e recusar não anuncia nada —
> mas isso é chamada do operador. Fica sinalizado aqui para ser revertido se ele
> discordar.

### E um quinto, de fuso horário

Edge Functions rodam em **UTC**. `setHours(9)` significava 06:00 em São Paulo, e
`openHour: 6` significava **03:00** — exatamente a hora que o comentário do
`followups.ts` alerta que faz um número ser denunciado. Uma resposta adiada de
madrugada era agendada para 3h da manhã de Brasília. Corrigido nos três lugares
(gate de horário, `nextOpening`, `nextMorning`) com `Intl.DateTimeFormat` e
`America/Sao_Paulo`; um teste varre as 24 horas de entrada.

### Merges recentes no `main`

| PR | O que entrou |
|---|---|
| [#12](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/12) | Os quatro gates cegos a negação. **Ainda aberto no momento desta escrita** — este branch já o contém. |
| [#11](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/11) | `SEVERITY` corrigida, três portas de handoff que vazavam, fuso horário, falso positivo da sentinela de humano |
| [#10](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/10) | Tópicos 3–5: adiamento real, resposta de espera, sentinela §Q12 |
| [#9](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/9) | Tópicos 1–2: classificação dos gates e o laço de reescrita |
| [#8](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/8) | Núcleo do agente: guardrails, máquina de estados, seam de custo, handler de turno, réguas de follow-up |
| #6/#7 | Reorganização de `docs/` em três compartimentos + pesquisa de Meta Ads Conversions API |
| [#4](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/4) | Quatro rodadas de decisão com o operador + o plano de construção ponta a ponta |
| [#3](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/3) | Contexto inicial: produto, oferta, economia do COD, pesquisa em 8 repositórios, especificação, guardrails |

Sem CI configurado neste repositório (`.github/workflows/` não existe), então
"verde" aqui significa três comandos locais: `pnpm test`, `pnpm typecheck` e
`pnpm typecheck:function`. **O `tsconfig` não cobre a Edge Function**
(`include: ["src", "tests"]`) — por isso existe `pnpm typecheck:function`, que
roda `deno check` naquele arquivo. Rodar os três antes de todo deploy.

### O documento mais importante para começar

[`docs/agente-ia/05-plano/README.md`](docs/agente-ia/05-plano/README.md) — o
plano de construção do MVP, com as fases A (sem canal, sem gasto) e B (com
WhatsApp), a estimativa em sessões (§7) e as perguntas em aberto por onda (§4).

---

## O que já existe em código (não é mais só plano)

Tudo isto está commitado, com teste, e o essencial já foi **deployado e testado
contra serviços reais** (Supabase, OpenAI, Gemini, n8n) — não é teoria de
repositório.

| Peça | Arquivo | Estado |
|---|---|---|
| Onze guardrails determinísticos, cada um com classe de remediação | `src/agent/guardrails.ts` (espelhado em `supabase/functions/turn/guardrails.ts`) | ✅ 41 testes, rodando em produção |
| Laço de autocorreção (reescrever / adiar / parar / handoff) | `src/agent/retry.ts` (espelhado) | ✅ 11 + 13 testes, exercitado em produção |
| Máquina de estados da conversa | `src/agent/state-machine.ts` | ✅ 6 testes |
| Recomendador de tamanho | `src/agent/sizing.ts` (espelhado) | ✅ 12 testes, chamado pela Edge Function e verificado em produção — ver R8.4 |
| Extrator de endereço (§D2) | `src/agent/address.ts` | ⚠️ 12 testes, **não ligado à conversa ainda** — falta o laço de confirmação |
| Contrato de checkout + mock (§E1/§E2) | `src/order/checkout.ts` | ⚠️ 10 testes, **mock** até a credencial da Coinzz existir |
| Ritmo humano (atraso por bolha, "digitando") | `src/agent/pacing.ts` | ✅ 6 testes |
| Réguas de silêncio (3 toques), pós-pedido (4 mensagens) e resposta adiada | `src/agent/followups.ts` (espelhado) | ✅ 15 + 5 testes, rodando por cron em produção |
| Seam de chamada de modelo (teto de custo, custo por chamada) | `src/llm/seam.ts`, `src/llm/pricing.ts` | ✅ 5 testes |
| Adapters de modelo | `src/llm/providers/{openai,gemini}.ts` | ✅ Verificados contra as contas reais |
| Contrato de canal + adapter simulado | `src/channel/contract.ts`, `src/channel/simulated.ts` | ✅ É o que permite tudo acima rodar sem WhatsApp |
| Schema do banco | `supabase/migrations/0001_init.sql`, `0002_retention_cron.sql`, `0003_deferred_reply.sql` | ✅ Aplicado no projeto `Ricos com AI` (Supabase) |
| Handler do turno (o cérebro) | `supabase/functions/turn/index.ts` | ✅ **Deployado** como Edge Function `turn` (**versão 12**), testado ponta a ponta com conversas reais |
| Fluxo de entrada | n8n, workflow `Encorpa — Turno da agente` (`HnGrxquQLpfbXWLH`) | ✅ Publicado, webhook `POST /encorpa-inbound` |
| Cron da régua | n8n, workflow `Encorpa — Relógio da régua` (`SVDtFUi2N9oOskkx`) | ✅ Publicado, varre a cada 5 min |
| Retenção de 90 dias | `pg_cron` dentro do próprio banco | ✅ Todo dia às 04:00, roda mesmo se o n8n cair |

**Cópias que precisam ficar idênticas.** A Supabase sobe conteúdo de arquivo,
não resolve o repositório — então `guardrails.ts`, `followups.ts`, `sizing.ts` e
`retry.ts` existem duas vezes (uma para teste local, uma para a Edge Function).
O teste `tests/function-drift.test.ts` falha se as duas cópias de qualquer um dos
quatro divergirem — sempre editar os dois lados juntos. É por isso que
`retry.ts` declara `Remedy` localmente em vez de importar: **zero imports** é o
que permite a cópia byte a byte.

### R8.4 — corrigida nesta sessão

O recomendador de tamanho (`sizing.ts`) existia com testes e a regra "na dúvida,
o maior", mas a Edge Function não o chamava — o modelo deduzia o tamanho sozinho
a partir da tabela em cm que está no prompt. Numa conversa de teste real, o
modelo indicou **G** para manequim 42, quando a tabela determinística indica
**M**. Tamanho errado vira devolução, e devolução em COD é prejuízo, não neutro.

**Correção:** `extractDressSize` lê o manequim (faixa plausível 34–56) da
própria mensagem da cliente; quando presente, o handler resolve o tamanho por
`sizeFromDressSize` e injeta o resultado no prompt como fato a declarar — "não
recalcule, diga esse tamanho". O teste `sizeFromDressSize(42) === "M"` trava a
regressão.

**Verificado em produção**, com os dados de teste apagados depois:

| Sonda | Esperado | Obtido |
|---|---|---|
| "uso manequim 42, qual tamanho eu peço?" | M | ✅ "Para o manequim 42, o tamanho indicado é M" |
| "meu manequim é 46, qual serve?" | G | ✅ "Para o manequim 46, o tamanho indicado é G" |
| "não quero mais receber nada" | `opted_out` | ✅ `{"status":"opted_out"}` |

A terceira sonda não é sobre tamanho: ela prova que a normalização de acentos do
`guardrails.ts` (`normalize("NFD")` + faixa de diacríticos) sobreviveu ao deploy
— se tivesse quebrado, "não" não viraria "nao" e o opt-out passaria batido.
Custo medido: **R$ 0,00095 por troca**, contra o teto de R$ 1,00.

### O classificador de intenção não serve de guarda-corpo

Quem decide se um número é manequim é o **texto**, não o classificador:
`extractDressSize` exige uma pista antes do número ("manequim", "visto", "uso",
"tamanho"…) ou uma mensagem que seja só o número — que é como se responde "qual
seu manequim?" — e recusa quando vem uma unidade depois ("anos", "kg", "cm",
"reais"). Cinco testes travam os dois lados. **A lição vale para além deste
caso: o classificador é bom para rotear conversa, e ruim como condição de
escrita no banco.**

### O deploy vinha atrasado em relação ao repositório

Ao comparar produção com o `main` antes de um redeploy, a versão que estava no ar
divergia do repositório **nos dois sentidos**: o `followups.ts` em produção ainda
apontava para o caminho antigo `docs/agente/...` (a correção do PR #8 nunca foi
deployada), e o `index.ts` em produção tinha um docblock melhor que nunca foi
commitado. **Deploy aqui é manual e nada compara os dois lados** — não há
`.github/workflows/`, e o `function-drift.test.ts` só compara `src/` com
`supabase/functions/`, nunca com o que está no ar. Registrado em
[`.claude/memory/edge-function-drift.md`](.claude/memory/edge-function-drift.md).
Comparar antes de deployar.

---

## A pilha, fixada na rodada 5, com preços confirmados na rodada 7

| Peça | Papel |
|---|---|
| **Supabase (Postgres)** | Todo o estado — projeto `Ricos com AI`, org `OFERTA ENCORPA` |
| **n8n** | Cano e relógio — instância nova, dois workflows publicados (ver tabela acima) |
| **WAHA** | Transporte do WhatsApp. Ainda não conectado — falta o número |
| **PikaPods** | Só o que precisa ficar de pé 24/7. Ainda não provisionado |
| **Hermes Agent** | Otimizador periódico. Lê conversas, **propõe** mudanças; nunca publica sozinho. Ainda não implementado |
| **gpt-5.6-luna** (OpenAI) | A conversa que converte — verificado, ~R$ 0,0009 por troca completa |
| **gemini-3.5-flash-lite** (Google) | Trabalho barato (classificação de intenção) e todo o desenvolvimento — verificado |

**Duas restrições de execução:** ainda não existe número de WhatsApp, e não se
gasta nada antes de esgotar o gratuito. Por isso o plano está em duas fases: a
fase A inteira roda contra um **canal simulado** e não depende do número; a fase
B pluga o canal real. Ver
[`docs/agente-ia/05-plano/README.md`](docs/agente-ia/05-plano/README.md) §3 e §7.

---

## O que já foi decidido (não reabrir)

Registro cronológico completo em
[`docs/documentacao/decisoes/03-decisoes-tomadas.md`](docs/documentacao/decisoes/03-decisoes-tomadas.md)
(rodadas 1–9). Pontos que mais importam para quem retoma o trabalho:

- **Prazo de entrega real: 3 a 5 dias no COD** (corrigido na rodada 7 — não é 7 a
  14). No antecipado, nenhum número é dito: o frete varia por região e a
  transportadora informa no checkout. O guardrail de prazo distingue promessa
  (pré-venda, veta) de fato já agendado (logística, libera) — ver R8.1.
- **Divergência aberta com o site:** o FAQ do Encorpa-Website ainda promete "7 a
  14 dias" — precisa ser alinhado ao prazo real antes do lançamento.
- **Guardrail que barra se autocorrige** (R9, esta sessão): reescrever, adiar ou
  parar, decidido pelo próprio gate; o operador só é notificado quando as duas
  reescritas falham ou o teto de custo estoura, e a cliente nunca fica sem
  resposta.
- **O classificador de intenção roteia conversa, não autoriza escrita no banco**
  (R9.1).
- **Teto de custo:** R$ 0,80 por conversa, +25% de tolerância antes do handoff
  (R7.3) — na prática nunca chega perto: uma troca completa custa ~R$ 0,001.
- **Guardrail roda em Edge Function**, chamada por HTTP do n8n — não em nó de
  n8n, porque precisa ser testável em CI (R7.4).
- **Retenção de dado pessoal: 90 dias**, renovados a cada novo contato — cron do
  próprio banco (R6.3, R8.2).
- **Cadência do Hermes:** a cada 50 leads atendidos, não por calendário (R6.2).
- **Notificação de handoff:** por e-mail enquanto não há WhatsApp (R6.1); o
  destino é o e-mail pessoal do operador, em `config/business.json` →
  `handoff.email`, que é **gitignored** por ser dado pessoal (R9.2).
- **Contas separadas por projeto:** n8n, APIs de modelo e PikaPods em contas
  próprias da Encorpa (R7.5).
- **Todos os áudios do funil serão regravados** — a locutora original não está
  mais disponível; os quatro roteiros novos estão em
  [`docs/agente-ia/06-script/02-script-do-agente.md`](docs/agente-ia/06-script/02-script-do-agente.md).
- **Desconto antecipado:** 15% — o frete do antecipado fica com a cliente; o site
  já implementa isso.
- **Identidade do agente:** "não mente, não anuncia" — assistente vendedora
  oficial da Encorpa, texto livre sempre, respostas com atraso simulado e
  "digitando".

---

## O que falta para fechar a onda A3

Nada disto depende do número de WhatsApp:

1. **Ligar a coleta de endereço ao turno.** `address.ts` extrai e sabe o que
   falta; o que não existe é o laço de conversa do §D2/§D5 — perguntar o que
   falta, repetir o endereço de volta e **só então** gravar. Não liguei pela
   metade de propósito: gravar endereço sem confirmação explícita põe no banco um
   endereço que ninguém conferiu, e em COD isso vira entrega perdida.
2. **Ligar o checkout.** O contrato e o mock estão prontos; falta a credencial da
   Coinzz (pergunta 4 do plano) e o registro do pedido na tabela `orders`, usando
   `idempotencyKey` como `external_id`.
3. **Enviar a notificação de handoff.** O payload já está montado e o destino
   decidido; falta o envio em si. Hoje o handler grava `handoff_at`, responde a
   cliente e para — quem manda o e-mail é o n8n, e esse fluxo não existe.
   Atenção: em produção o `BUSINESS_CONFIG` devolve `notify: null`, porque a
   Edge Function lê a variável de ambiente e o e-mail só existe no
   `config/business.json` local (gitignored).
4. **Gate `pacing` carrega `defer`, mas seria agendado para a próxima abertura**
   — errado para um limite horário, que reabre na hora seguinte. Está dormente
   porque o `index.ts` nunca passa `ctx.pacing`; corrigir antes de ligar o
   ritmo real.

---

## O que fazer em seguida

Em ordem:

1. **Comprar o chip do WhatsApp e começar a usá-lo como número comum.** Única
   coisa com prazo de calendário: número novo precisa de semanas de uso normal
   antes de tráfego pago. Não bloqueia a fase A, mas atrasa a fase B.
2. **Mergear o PR #12** se ainda estiver aberto (ver tabela de merges).
3. **Alinhar o FAQ do site ao prazo real** (3 a 5 dias) — divergência aberta.
4. Fechar a onda A3 pelos quatro itens da seção acima, e seguir para a A4
   (Hermes, conversão de volta para o Meta).
5. **Rotacionar as credenciais** coladas em texto puro durante o desenvolvimento
   de sessões anteriores (service_role key da Supabase, chaves OpenAI/Gemini) —
   ficaram em histórico de chat, motivo suficiente para trocar antes do
   lançamento.
6. Acompanhar o `HANDOFF.md` do **Encorpa-Website** para mudanças no site que
   afetem o agente — a relação é de mão dupla.

---

## Como verificar sem gastar

O que funcionou esta sessão inteira, e vale repetir: **sonda barata contra
produção, e apagar as linhas depois**. Todo defeito de gravidade alta desta
sessão (idade virando manequim, `ON CONFLICT`, `SEVERITY` invertida, cegueira a
negação) foi achado rodando a coisa real, nenhum foi achado lendo o código. Uma
troca completa custa ~R$ 0,001 — a sonda é mais barata que o bug.

Antes de todo deploy, os três comandos: `pnpm test`, `pnpm typecheck`,
`pnpm typecheck:function`.

---

## Sistema de memória entre sessões

Este repositório tem uma camada de memória persistente em
[`.claude/memory/`](.claude/memory/), carregada automaticamente via `CLAUDE.md`.
**Ler [`MEMORY.md`](.claude/memory/MEMORY.md) antes de qualquer trabalho** — é o
índice de fatos que uma sessão nova ficaria surpresa de não saber de antemão.
Duas entradas nasceram nesta sessão: `edge-function-drift.md` e
`on-conflict-partial-index.md`. Ainda não existe camada 2 (armazenamento de longo
prazo fora do repositório).

Este repositório também adotou um formato de resposta próprio —
[`.claude/skills/i-have-adhd/SKILL.md`](.claude/skills/i-have-adhd/SKILL.md):
ação primeiro, passos numerados, sem preâmbulo. Vale por padrão; o operador
desliga dizendo "modo normal".

---

## Mapa dos documentos

| Arquivo | Para quê |
|---|---|
| `HANDOFF.md` | Este. Estado do projeto inteiro, para trocar de sessão. |
| `CLAUDE.md` | Memória de projeto: stack, comandos, convenções, tabela de agentes especialistas. |
| `.claude/memory/MEMORY.md` | Índice de memória entre sessões — ler antes de trabalhar. |
| `.claude/skills/i-have-adhd/` | Formato de resposta padrão adotado pelo operador. |
| `docs/agente-ia/README.md` | Índice de todo o contexto do agente — comece por aqui se for a primeira vez. |
| `docs/agente-ia/01-conhecimento/` | O que o agente pode dizer: base de conhecimento (objeções, FAQ) e tabela de medidas. |
| `docs/agente-ia/02-especificacao/` | O que o agente faz: mapa funcional, tools, máquina de estados, guardrails. |
| `docs/agente-ia/03-pesquisa/` | 8 repositórios open source lidos em código, com evidência por arquivo e linha. |
| `docs/agente-ia/05-plano/` | O plano de construção até o MVP — comece por aqui para retomar o trabalho. |
| `docs/agente-ia/06-script/` | Diagnóstico do funil recebido do operador e o script reescrito para a Encorpa. |
| `docs/documentacao/contexto-negocio/` | O negócio: produto, oferta, público, economia do COD, modelo econômico, decisões firmes. |
| `docs/documentacao/decisoes/` | Lacunas, decisões em aberto e o log cronológico de decisões já tomadas (rodadas 1–9). |
| `docs/campanhas-e-anuncios/` | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API. |
| `src/`, `supabase/functions/turn/`, `tests/` | O código do agente — ver a tabela "O que já existe em código" acima. |
