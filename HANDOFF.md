# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive **todo** o
> contexto do projeto — negócio, pesquisa, especificação, decisões — e onde o
> agente de IA de vendas via WhatsApp está sendo construído. O outro
> repositório, `colet-cinta-modeladora` (renomeado para **Encorpa-Website**),
> guarda só o site oficial da Encorpa (landing page, checkout) e um
> `HANDOFF.md` resumido específico dele. Se um dia os dois divergirem sobre
> negócio, **este repositório é a fonte**.

> Atualizado em: 2026-09-08

---

## Em uma frase

O agente saiu do papel: onda A0 e metade da A3 já rodam em produção contra o
banco real, com uma conversa completa (turno + guardrails + custo) e as duas
réguas de acompanhamento (silêncio e pós-pedido) funcionando por cron —
**tudo isso sem número de WhatsApp**, contra um contrato de canal que o WAHA
vai preencher quando o número existir.

---

## Onde o trabalho parou

### Trabalho da sessão de 2026-09-08 — a varredura por falhas

A sessão não escreveu funcionalidade nova: foi atrás do que já estava lá e estava
errado. Sondas contra a cadeia real, com a configuração de produção, acharam sete
defeitos confirmados, mais um oitavo achado na última varredura. Todos corrigidos,
com teste que trava cada um. **175 testes**,
`pnpm lint`, `pnpm typecheck`, `pnpm test` e `deno check` verdes.

**A cegueira a negação tinha um lado que ninguém tinha olhado.** O PR #12 varreu os
gates que vetavam a frase honesta. O espelho disso — a negativa qualquer que libera a
promessa — estava intacto e é o lado caro:

| Frase | Devia | Fazia |
|---|---|---|
| "**Sem juros** e sem burocracia, sai por **R$ 59,90**" | barrar | passava |
| "**Sem esperar** muito, **chega amanhã**" | barrar | passava |
| "**Te dou 30%** agora" | barrar | passava (o gate só olhava % se a palavra "desconto" existisse) |
| "O tecido é **92%** poliamida" | passar | barrava — reescrita paga por frase correta |
| "Custa **200 reais**" | barrar | passava (só `R$` era preço) |
| "**não uso 40**, uso 46" | ler 46 | lia **40** — gravava M para uma cliente G |
| "Rua das Flores, **13010-100**" | sem número | lia **13010** como número da casa |

Os dois últimos são os caros de verdade: tamanho errado e endereço errado, em COD,
são o pacote que viaja, falha e volta. O `negatedAt` agora trata `sem` como o que ele
é — nega o substantivo ao lado, não tudo o que vem depois —, o gate de porcentagem
decide pela vizinhança do número (e composição de tecido vence desconto), e
`sizing.ts` ganhou a mesma fronteira de cláusula. Registrado em
[`.claude/memory/negation-blindness.md`](.claude/memory/negation-blindness.md), porque
os quatro módulos que leem português com regex já erraram nisso.

**Falha de provedor sumia com a cliente, para sempre.** Um throw da OpenAI ou da
Gemini escapava do handler. A mensagem de entrada já estava gravada, então a
retentativa do n8n recebia `duplicate` — e a cliente ficava esperando uma resposta que
ninguém estava escrevendo. Silencioso, permanente, invisível no log; e o custo até a
falha também se perdia. Agora sai pela mesma porta de todo beco sem saída: resposta de
espera, handoff, custo gravado.

**Dois gates estavam mortos e um cobrava caro.** `identical_template` nunca recebeu
`recentOutbound` — passava por construção em toda mensagem que a agente já mandou;
agora recebe o histórico, que já era buscado. `invented_testimonial` lia qualquer aspa
como depoimento, então repetir a pergunta da própria cliente virava reescrita paga;
agora só conta a aspa que alguém assina. `pacing` continua sem contexto **de
propósito**: os contadores são da camada de canal, que não existe sem o WhatsApp.

**A régua de silêncio se destruía de madrugada.** Quem para de responder às 23:30 tem
o `silence_1` vencendo à meia-noite — fora da janela 6-24. A varredura tratava **todo**
bloqueio como cancelamento, então o toque mais valioso da régua (o de 30 minutos
depois, quando ela ainda lembra da conversa) era jogado fora em vez de sair ao
amanhecer. O handler do turno distingue `defer` de `stop` desde o laço de reescrita; a
metade do relógio nunca aprendeu a diferença.

A decisão mora em `followups.decideTouch` — em `followups.ts`, e não dentro da Edge
Function, porque ali nenhum teste alcança: a primeira versão desta correção podia ser
apagada inteira sem que um único teste falhasse. Ela também resolve o efeito colateral
de arrastar um toque só: adiar o `silence_1` para as 06:00 e deixar o `silence_2` às
09:00 comprime a régua de nove horas para três, que é como um número é denunciado. A
régua de silêncio é **reancorada** na reabertura; o pós-pedido e a resposta adiada só
se movem, porque a hora deles é a própria mensagem.

**Ressalva registrada:** `pacing` também é `defer`, e adiar para a reabertura é certo
para um teto diário e longo demais para um horário. Latente hoje — a varredura não
passa contador nenhum, porque eles são da camada de canal.

**Três buracos de processo, fechados:**

1. **`pnpm lint` nunca rodou.** O script chamava eslint, que não estava instalado nem
   configurado. Um comando que sempre falha é pior que comando nenhum. Pegou um erro
   real na primeira execução.
2. **Existe CI.** [`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda os quatro
   comandos canônicos mais `typecheck:function` — a única coisa que olha o arquivo que
   a produção executa de verdade. "Verde" deixa de significar "alguém lembrou".
3. **A quinta cópia, que não é arquivo.** A Edge Function declara o próprio `PRICES`
   inline. Nenhuma das duas tabelas sabia da outra: mudar `src/llm/pricing.ts` deixava
   a produção cobrando o preço velho e todo custo gravado dali em diante
   incomparável. O `function-drift.test.ts` agora lê o literal de dentro do
   `index.ts` — verificado mudando um lado e vendo falhar.

Também: `llm_calls` tem colunas de token e gravava zero em todas, o que deixa o custo
armazenado sem detalhe para conferir contra a fatura. Agora grava.

**A divergência do prazo, fechada.** O site prometia "entre 7 e 14 dias" no FAQ e na
página de obrigado, contra os 3 a 5 decididos na rodada 7 — e o guardrail da agente
**recusa** responder fora dessa janela. A mesma cliente lia um número no site e ouvia
outro da agente. Corrigido no `Encorpa-Website` (branch
`claude/ricos-handoff-analysis-n0bi4z`) e nos cinco lugares onde ainda aparecia nos
docs daqui. O caminho antecipado ganhou passo próprio, sem número, pela mesma razão
que a agente não diz nenhum ali.

### Deployado e verificado em produção — Edge Function na versão 13

Subiu do `main` mergeado, depois de comparar com o que estava no ar (o drift já mordeu
duas vezes). A v12 não tinha nada exclusivo a recuperar desta vez: a divergência era só
"produção estava atrás".

Cinco sondas contra o Supabase real, **todas `rewrites: 0`** — nenhuma reescrita paga,
que é metade do ponto das correções:

| Sonda | Esperado | Obtido |
|---|---|---|
| "Me dá um desconto de 30%" | recusar sem ser vetada | ✅ *"Não consigo liberar 30%, mas pagando antes você tem 15%…"* |
| "**não uso 40, uso 46**" | ler 46 → **G** | ✅ resposta correta **e `leads.size = G`** no banco (antes gravava M) |
| "você é um robô?" | responder de primeira | ✅ *"Sou a assistente virtual da Encorpa"* |
| "tem cupom de desconto?" | não anunciar cupom | ✅ respondeu com o desconto real, sem a palavra |
| "consegue entregar amanhã?" | 3 a 5 dias, sem promessa | ✅ *"A entrega é agendada e acontece em 3 a 5 dias"* |

As colunas de token de `llm_calls` deixaram de gravar zero (48/2, 323/154, …), e as
três linhas da régua de silêncio foram agendadas em cada conversa. Custo total das
cinco: **R$ 0,0045**. Dados de teste apagados; banco conferido, zero órfãos.

**Uma ressalva sobre comparar produção com o repositório.** O `deploy_edge_function`
recebe o conteúdo em JSON, então `\u2014` e `\u0300` chegam como o caractere literal.
Produção e repositório ficam **semanticamente idênticos e byte a byte diferentes** nas
linhas que usam escape — comparar sempre pelo sentido, nunca por `diff` cru. A conferência
desta vez achou o inverso também: duas linhas de comentário no repositório tinham o texto
literal `\u2014` em vez do travessão. Corrigido.

### Trabalho da sessão de 2026-09-07

Os cinco tópicos do plano de autocorreção estão **fechados em código**, com 133
testes, `tsc --noEmit` e `deno check` verdes:

1. **Classificação dos gates** — cada um declara `rewrite` / `defer` / `stop`;
   `remedyFor` devolve a mais estrita quando mais de um barra.
2. **Laço de reescrita** — veto → motivo e texto vetado voltam pelo system
   prompt → nova tentativa → cadeia de novo. Máximo 2, teto de custo valendo.
3. **Adiamento real** — `followups.body` guarda a resposta já escrita e
   `nextOpening` marca a reabertura da janela; o cron existente reenvia, e a
   cadeia roda de novo na hora do envio.
4. **Resposta de espera + notificação** — `HOLDING_REPLY` e
   `HUMAN_HANDOFF_REPLY` passam na cadeia inteira, com teste; o payload de
   handoff leva e-mail, `leadId`, telefone e `conversationId`.
5. **Sentinela de pedido de humano (§Q12)** — determinística, roda **antes** de
   qualquer chamada de modelo.

**Deployado e verificado em produção — Edge Function na versão 12.** As sondas
confirmaram, contra o Supabase real: pedido de humano vira handoff sem gastar
uma chamada de modelo; a cliente já em handoff não é respondida por cima do
humano; o falso positivo da sentinela sumiu; o adiamento agenda para 06:00 de
**Brasília** (`runAt` 09:00Z), provando a correção de fuso; e o laço de
reescrita foi exercitado de ponta a ponta com `rewrites: 2` → resposta de
espera → payload de notificação.

### A cegueira a negação, varrida em toda a cadeia

Rodando as sondas contra produção, o laço de reescrita apareceu funcionando — e
expôs por que ele estava sendo acionado. A cliente pediu 30% de desconto, a
agente respondeu **"Não consigo oferecer 30% de desconto"** — a resposta certa —
e o `price_promise` vetou, porque o texto contém "30%" perto de "desconto".
Duas reescritas queimadas e handoff, para um turno que a agente já tinha
acertado de primeira. Custo: R$ 0,0045 em vez de R$ 0,0015.

Isso é a mesma falha que o `weight_loss_claim` já tinha tido e corrigido em 2026-09-06.
A varredura achou mais três gates com ela, todos confirmados barrando ao vivo:

| Gate | Frase honesta que era vetada |
|---|---|
| `price_promise` | "Não consigo oferecer 30% de desconto" |
| `delivery_promise` | "Não consigo entregar amanhã, a entrega leva de 3 a 5 dias" |
| `humanity_claim` | "**Não sou uma pessoa, sou a assistente virtual**" — a frase que o próprio system prompt exige |
| `coupon_exists` | "Não temos cupom no momento" |

O `humanity_claim` era o pior: a agente não conseguia responder **"você é um
robô?"**, a pergunta mais previsível que ela vai receber.

A correção extraiu o `negatedAt` que já existia dentro do `weight_loss_claim` e
o aplicou aos quatro. Duas exceções ficam de fora de propósito: negar ser robô
(`"não sou um robô"`) **continua barrado**, porque ali a negação é a própria
infração; e a negação não atravessa fronteira de frase, então
`"Não temos frete grátis: hoje sai por R$ 99,90"` continua barrado.

**Uma decisão de produto embutida:** liberar `"não temos cupom"` muda o que a
agente pode dizer sobre promoção. O gate existe para ela nunca anunciar cupom
que não existe na Coinzz, e recusar não anuncia nada — mas isso é chamada do
operador, e fica sinalizado aqui para ser vetado se ele discordar.

**Verificado na v12**, três sondas, todas `rewrites: 0`: identidade, cupom e
prazo respondidos corretamente de primeira.

### O erro que a verificação em produção pegou

A migração da resposta adiada trocou a `unique (conversation_id, kind)` de
`followups` por um índice único **parcial**, para permitir várias respostas
adiadas por conversa. Isso **quebrou o agendamento em produção**: o handler faz
upsert com `on_conflict=conversation_id,kind`, e o Postgres recusa `ON CONFLICT`
contra índice parcial. Pior, a chamada é `.catch(() => undefined)` — o turno
seguiria respondendo e a régua de silêncio simplesmente pararia de agendar, sem
erro visível, por dias.

Revertido em minutos e verificado. A decisão final é manter a unicidade total: a
resposta adiada mais nova substitui a anterior, que é a pergunta viva quando a
janela reabre. Está registrado em
[`.claude/memory/on-conflict-partial-index.md`](.claude/memory/on-conflict-partial-index.md)
e como aviso dentro da própria migração.

### Trabalho da sessão anterior

Branch `claude/handoff-continuacao-gs6x7x`:

1. **R8.4 corrigido** — o recomendador de tamanho determinístico é chamado
   pela Edge Function, verificado em produção. Seção dedicada mais abaixo.
2. **`leads.size` passou a ser gravado** — nada escrevia nele, e a régua de
   pós-pedido saía com "Colete tamanho **—**" para a cliente ler.
3. **Extrator de endereço** (`src/agent/address.ts`, §D2) — pronto e testado,
   ainda não ligado à conversa. Ver "o que falta para fechar a A3".
4. **Contrato de checkout da Coinzz** (`src/order/checkout.ts`, §E1/§E2) —
   formato escrito, mock no lugar da credencial, idempotência testada.

5. **Autocorreção no lugar de handoff** (tópicos 1 e 2 do plano de remediação)
   — seção dedicada mais abaixo. **Ainda não deployado.**

122 testes, `tsc --noEmit` e `deno check` passam. O que resta de bloqueante não
é código: é o número de WhatsApp.

### Merges recentes no `main`

| PR | O que entrou |
|---|---|
| [#8](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/8) | Núcleo do agente: guardrails, máquina de estados, seam de custo de modelo, handler de turno, réguas de follow-up. Teve conflito de merge contra o `main` (que havia reorganizado `docs/` nos PRs #6/#7) — resolvido, caminhos atualizados sem alterar conteúdo. **Mergeado.** |
| #6/#7 | Reorganização de `docs/` em três compartimentos (`documentacao/`, `agente-ia/`, `campanhas-e-anuncios/`) + pesquisa de Meta Ads Conversions API |
| [#4](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/4) | Quatro rodadas de decisão com o operador + o plano de construção ponta a ponta |
| [#3](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/3) | Contexto inicial: produto, oferta, economia do COD, pesquisa em 8 repositórios open source, especificação funcional, guardrails |

O CI existe desde 2026-09-08 ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))
e roda `lint`, `typecheck`, `test` e `typecheck:function` em todo push e PR.

### O documento mais importante para começar

[`docs/agente-ia/05-plano/README.md`](docs/agente-ia/05-plano/README.md) — o
plano de construção do MVP, com as fases A (sem canal, sem gasto) e B (com
WhatsApp), a estimativa em sessões (§7) e as perguntas em aberto por onda
(§4).

---

## O que já existe em código (não é mais só plano)

Tudo isto está commitado neste branch, com teste, e o essencial já foi
**deployado e testado contra serviços reais** (Supabase, OpenAI, Gemini, n8n)
nesta sessão — não é só teoria de repositório.

| Peça | Arquivo | Estado |
|---|---|---|
| Onze guardrails determinísticos | `src/agent/guardrails.ts` (espelhado em `supabase/functions/turn/guardrails.ts`) | ✅ 31 testes, rodando em produção |
| Máquina de estados da conversa | `src/agent/state-machine.ts` | ✅ 6 testes |
| Recomendador de tamanho | `src/agent/sizing.ts` (espelhado em `supabase/functions/turn/sizing.ts`) | ✅ 12 testes, chamado pela Edge Function e verificado em produção — ver R8.4 abaixo |
| Extrator de endereço (§D2) | `src/agent/address.ts` | ⚠️ 12 testes, **não ligado à conversa ainda** — falta o laço de confirmação |
| Contrato de checkout + mock (§E1/§E2) | `src/order/checkout.ts` | ⚠️ 10 testes, **mock** até a credencial da Coinzz existir |
| Ritmo humano (atraso por bolha, "digitando") | `src/agent/pacing.ts` | ✅ 6 testes |
| Réguas de silêncio (3 toques) e pós-pedido (4 mensagens) | `src/agent/followups.ts` (espelhado em `supabase/functions/turn/followups.ts`) | ✅ 15 testes, rodando por cron em produção |
| Seam de chamada de modelo (teto de custo, custo por chamada) | `src/llm/seam.ts`, `src/llm/pricing.ts` | ✅ 5 testes |
| Adapters de modelo | `src/llm/providers/{openai,gemini}.ts` | ✅ Verificados contra as contas reais |
| Contrato de canal + adapter simulado | `src/channel/contract.ts`, `src/channel/simulated.ts` | ✅ É o que permite tudo acima rodar sem WhatsApp |
| Schema do banco | `supabase/migrations/0001_init.sql`, `0002_retention_cron.sql`, `0003_deferred_reply.sql` | ✅ Aplicado no projeto `Ricos com AI` (Supabase) |
| Handler do turno (o cérebro) | `supabase/functions/turn/index.ts` | ✅ **Deployado** como Edge Function `turn` (versão 13), verificado por sondas contra o banco real |
| Fluxo de entrada | n8n, workflow `Encorpa — Turno da agente` (`HnGrxquQLpfbXWLH`) | ✅ Publicado, webhook `POST /encorpa-inbound` |
| Cron da régua | n8n, workflow `Encorpa — Relógio da régua` (`SVDtFUi2N9oOskkx`) | ✅ Publicado, varre a cada 5 min |
| Retenção de 90 dias | `pg_cron` dentro do próprio banco | ✅ Todo dia às 04:00, roda mesmo se o n8n cair |

**Cópias que precisam ficar idênticas.** A Supabase sobe conteúdo de arquivo,
não resolve o repositório — então `guardrails.ts`, `followups.ts`,
`sizing.ts` e `retry.ts` existem duas vezes (uma vez para teste local, uma vez
para a Edge Function). O teste `tests/function-drift.test.ts` falha se as duas
cópias de qualquer um dos quatro divergirem — sempre editar os dois lados
juntos. É por isso que `retry.ts` declara `Remedy` localmente em vez de
importar: zero imports é o que permite a cópia byte a byte.

### R8.4 — corrigida nesta sessão

O recomendador de tamanho (`sizing.ts`) existia com testes e a regra "na
dúvida, o maior", mas a Edge Function não o chamava — o modelo deduzia o
tamanho sozinho a partir da tabela em cm que está no prompt. Numa conversa de
teste real, o modelo indicou **G** para manequim 42, quando a tabela
determinística indica **M**. Tamanho errado vira devolução, e devolução em
COD é prejuízo, não neutro.

**Correção:** `sizing.ts` agora tem `extractDressSize`, que lê o manequim
(faixa plausível 34–56) da própria mensagem da cliente. Quando presente, o
handler do turno (`supabase/functions/turn/index.ts`) resolve o tamanho por
`sizeFromDressSize` e injeta o resultado no prompt como fato a declarar —
"não recalcule, diga esse tamanho" — em vez de deixar o modelo calcular. O
teste `sizeFromDressSize(42) === "M"` trava a regressão. `sizing.ts` passou a
ser espelhado em `supabase/functions/turn/sizing.ts` (mesmo tratamento que
`guardrails.ts` e `followups.ts` já tinham), com o `function-drift.test.ts`
cobrindo as três cópias agora.

**Verificado em produção.** A Edge Function foi redeployada (versão 6) e três
sondas rodaram contra o Supabase real, com os dados de teste apagados depois:

| Sonda | Esperado | Obtido |
|---|---|---|
| "uso manequim 42, qual tamanho eu peço?" | M | ✅ "Para o manequim 42, o tamanho indicado é M" |
| "meu manequim é 46, qual serve?" | G | ✅ "Para o manequim 46, o tamanho indicado é G" |
| "não quero mais receber nada" | `opted_out` | ✅ `{"status":"opted_out"}` |

A terceira sonda não é sobre tamanho: ela prova que a normalização de acentos
do `guardrails.ts` (`normalize("NFD")` + faixa de diacríticos) sobreviveu ao
deploy — se ela tivesse quebrado, "não" não viraria "nao" e o opt-out passaria
batido. Custo medido: **R$ 0,00095 por troca**, contra o teto de R$ 1,00.

### O classificador de intenção não serve de guarda-corpo

Ao ligar a gravação do `leads.size`, a primeira versão só gravava quando o
classificador barato dizia `TAMANHO`. Parecia suficiente e **não era**: em
produção, "tenho 44 anos, esse colete serve pra mim?" foi classificado como
`TAMANHO` — e com razão, ela está perguntando sobre tamanho — e o banco gravou
**G** para uma cliente de 44 anos. O modelo de conversa por sorte ignorou a
diretiva e perguntou o manequim, mas a linha errada já estava no banco.

A correção tirou o classificador do caminho. Quem decide se um número é
manequim agora é o texto: `extractDressSize` exige uma pista antes do número
("manequim", "visto", "uso", "tamanho"…) ou uma mensagem que seja só o número
— que é como se responde "qual seu manequim?" — e recusa quando vem uma
unidade depois ("anos", "kg", "cm", "reais"). Cinco testes travam os dois
lados. **A lição vale para além deste caso: o classificador é bom para rotear
conversa, e ruim como condição de escrita no banco.**

### O deploy vinha atrasado em relação ao repositório

Ao comparar produção com o `main` antes do redeploy, a versão 5 (a que estava
no ar) divergia do repositório nos dois sentidos. O `followups.ts` em produção
ainda apontava para o caminho antigo `docs/agente/...`: a correção de caminho
do PR #8 nunca chegou a ser deployada. E o `index.ts` em produção tinha um
docblock melhor, que documenta as duas portas de entrada e que nunca chegou a
ser commitado. **Deploy aqui é
manual e nada compara os dois lados** — não há `.github/workflows/`, e o
`function-drift.test.ts` só compara `src/` com `supabase/functions/`, nunca com
o que está no ar. O docblock foi recuperado para o repositório e a versão 6
saiu do `main`; da próxima vez, comparar antes de deployar.

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

**Duas restrições de execução:** ainda não existe número de WhatsApp, e não se gasta nada
antes de esgotar o gratuito. Por isso o plano está em duas fases: a fase A inteira
roda contra um **canal simulado** e não depende do número; a fase B pluga o canal real. Ver
[`docs/agente-ia/05-plano/README.md`](docs/agente-ia/05-plano/README.md) §3 e a estimativa em §7.

---

## O que já foi decidido (não reabrir)

Registro cronológico completo em
[`docs/documentacao/decisoes/03-decisoes-tomadas.md`](docs/documentacao/decisoes/03-decisoes-tomadas.md).
Pontos que mais importam para quem retoma o trabalho:

- **Prazo de entrega real: 3 a 5 dias no COD** (corrigido na rodada 7 — não é 7 a 14). No
  antecipado, nenhum número é dito: o frete varia por região e a transportadora informa no
  checkout. O guardrail de prazo sabe distinguir promessa (pré-venda, veta) de fato já
  agendado (logística, libera) — mesma frase, efeito oposto, ver R8.1.
- **Divergência aberta com o site:** o FAQ do Encorpa-Website ainda promete "7 a 14 dias" —
  precisa ser alinhado ao prazo real antes do lançamento.
- **Teto de custo:** R$ 0,80 por conversa, +25% de tolerância antes do handoff (R7.3) —
  na prática nunca chega perto: uma troca completa custa ~R$ 0,001.
- **Guardrail roda em Edge Function**, chamada por HTTP do n8n — não em nó de n8n, porque
  precisa ser testável em CI (R7.4).
- **Retenção de dado pessoal: 90 dias**, renovados a cada novo contato — cron do próprio
  banco (R6.3, R8.2).
- **Cadência do Hermes:** a cada 50 leads atendidos, não por calendário (R6.2).
- **Notificação de handoff:** por e-mail enquanto não há WhatsApp (R6.1).
- **Contas separadas por projeto:** n8n, APIs de modelo e PikaPods em contas próprias da
  Encorpa, sem misturar com outros projetos do operador (R7.5).
- **Todos os áudios do funil serão regravados** — a locutora original não está mais
  disponível; os quatro roteiros novos estão em
  [`docs/agente-ia/06-script/02-script-do-agente.md`](docs/agente-ia/06-script/02-script-do-agente.md).
- **Desconto antecipado:** 15% — o frete do antecipado fica com a cliente; o site já
  implementa isso.
- **Identidade do agente:** "não mente, não anuncia" — assistente vendedora oficial da
  Encorpa, texto livre sempre, respostas com atraso simulado e "digitando".

---

## Autocorreção no lugar de handoff (tópicos 1 e 2)

Um guardrail que barra deixou de ser silêncio ou tarefa do operador. Os onze
gates declaram a própria classe de remediação — **reescrever** (8), **adiar**
(2: horário e pacing), **parar** (1: opt-out) — e `remedyFor` devolve a mais
estrita quando mais de um barra, que é o que impede uma reescrita de preço de
atropelar um opt-out.

O handler agora roda um laço: veto → motivo e texto vetado voltam ao modelo
pelo **system prompt** (nunca pelo histórico, para não sujar o próximo turno)
→ nova tentativa → cadeia de novo. No máximo **2 reescritas**, e o teto de
custo vale para cada uma. Toda tentativa é gravada em `gate_traces`, porque
gate que insiste entre reescritas é problema de prompt — matéria-prima do
Hermes, não deste laço.

Esgotadas as tentativas (ou fora da janela, até o tópico 3), a cliente recebe
`HOLDING_REPLY` — uma resposta de espera que **passa na cadeia por
construção**, com teste — e só então o operador é notificado. Opt-out é o
único caminho que não responde nada.

**Ainda não deployado.** 122 testes, `tsc --noEmit` e `deno check` passam, mas
o laço nunca rodou contra o modelo real. **Primeiro passo da próxima sessão:**
deployar e sondar com "tem cupom de desconto?" — o gate `coupon_exists` barra
qualquer mensagem com a palavra "cupom" enquanto o cupom não existe na Coinzz,
então é o jeito mais barato de forçar uma reescrita de verdade. Esperado:
`rewrites: 1` e uma resposta final sem a palavra.

**O `tsconfig` não cobre a Edge Function** (`include: ["src", "tests"]`) — nada
verificava aquele arquivo. Agora existe `pnpm typecheck:function`, que roda
`deno check` nele. Rodar antes de todo deploy.

---

## O que falta para fechar a onda A3

Nada disto depende do número de WhatsApp. As duas peças novas existem e estão
testadas, mas **não estão ligadas à conversa** — é o próximo bloco de trabalho:

1. **Ligar a coleta de endereço ao turno.** `address.ts` extrai e sabe o que
   falta; o que não existe é o laço de conversa do §D2/§D5 — perguntar o que
   falta, repetir o endereço de volta e **só então** gravar. Não liguei pela
   metade de propósito: gravar endereço sem a confirmação explícita põe no
   banco um endereço que ninguém conferiu, e em COD isso vira entrega perdida.
2. **Ligar o checkout.** O contrato e o mock estão prontos; falta a credencial
   da Coinzz (pergunta 4 do plano) e o registro do pedido na tabela `orders`,
   usando `idempotencyKey` como `external_id`.
3. **Enviar a notificação de handoff.** O destino foi definido (R9.2): e-mail
   pessoal do operador, em `config/business.json` → `handoff.email`, que é
   gitignored por ser dado pessoal. Falta o envio em si — hoje o handler grava
   `handoff_at` e para; quem manda o e-mail é o n8n, e esse fluxo não existe.

---

## O que fazer em seguida

Em ordem:

1. ~~Deployar a Edge Function~~ — **feito**, versão 13, verificada por cinco sondas.
2. **Comprar o chip do WhatsApp e começar a usá-lo como número comum.** Única coisa com
   prazo de calendário: número novo precisa de semanas de uso normal antes de tráfego pago.
   Não bloqueia a fase A, mas atrasa a fase B se ficar para depois.
3. ~~Alinhar o FAQ do site ao prazo real~~ — **feito nesta sessão**, ver acima.
4. Continuar a onda A3 (extração de endereço, checkout pré-preenchido da Coinzz — falta
   credencial) e seguir para A4 (Hermes, conversão de volta para o Meta).
5. **Rotacionar as credenciais** coladas em texto puro durante o desenvolvimento das
   sessões anteriores (service_role key da Supabase, chaves OpenAI/Gemini) — ficaram em
   histórico de chat, o que é motivo suficiente para trocar antes do lançamento.
6. Acompanhar o `HANDOFF.md` do **Encorpa-Website** para mudanças no site que afetem o
   agente — a relação é de mão dupla.

---

## Sistema de memória entre sessões

Este repositório tem uma camada de memória persistente em
[`.claude/memory/`](.claude/memory/), carregada automaticamente via
`CLAUDE.md`. **Ler [`MEMORY.md`](.claude/memory/MEMORY.md) antes de qualquer
trabalho** — é o índice de fatos que uma sessão nova ficaria surpresa de não
saber de antemão. Ainda não existe camada 2 (armazenamento de longo prazo
fora do repositório).

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
| `docs/documentacao/decisoes/` | Lacunas, decisões em aberto e o log cronológico de decisões já tomadas (rodadas 1–8). |
| `docs/campanhas-e-anuncios/` | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API. |
| `src/`, `supabase/functions/turn/`, `tests/` | O código do agente — ver a tabela "O que já existe em código" acima. |
