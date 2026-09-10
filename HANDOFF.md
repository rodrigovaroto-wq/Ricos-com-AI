# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive o contexto do
> agente — negócio, pesquisa, especificação, decisões — e onde o agente de IA
> de vendas via WhatsApp está sendo construído. `colet-cinta-modeladora`
> (renomeado para **Encorpa-Website**) guarda só o site oficial da Encorpa
> (landing page, checkout). `encorpa-campanhas` guarda Meta Ads, atribuição de
> CTWA e Conversions API — saiu deste repositório em 2026-09-08, ver
> §Separação de repositórios. Se um dia divergirem sobre negócio, **este
> repositório é a fonte**.

> Atualizado em: 2026-09-10 — **v30 no ar**, byte a byte igual ao repositório,
> [PR #22](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/22) merjado.
>
> **⚠ O repositório deixou de ser byte a byte igual ao deploy.** A v30 continua no ar e
> continua correta, mas o `main` desta branch carrega três mudanças **não deployadas**:
> `CONVERSATION_MODEL` virou variável de ambiente, `firstReplyAt` passou a respeitar o
> fuso de São Paulo, e os três valores de preço/frete da Frente 4 entraram no
> `business.example.json`. Enquanto não houver deploy novo, **o código do repositório é
> a intenção e a v30 é o fato.** Ver [§O que mudou em 2026-09-10 à tarde](#o-que-mudou-em-2026-09-10-à-tarde-código-não-deployado).
>
> **E uma premissa da Frente 4 caiu.** O frete de R$ 15 a R$ 40 que o item 6 usava como
> "o que a cliente paga" é **custo do operador**, não preço dela: a oferta do antecipado
> na Coinzz vem **sem frete configurado nos 27 estados**. A conta corrigida está em
> [`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`](docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md).

---

## Separação de repositórios (2026-09-08)

`docs/campanhas-e-anuncios/` saiu deste repositório e virou
[`rodrigovaroto-wq/encorpa-campanhas-`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-)
— repositório próprio pra quem cuida de campanha/anúncio, sem disputar PR e
handoff com quem constrói o agente. Nada de código do agente mudou.

`docs/documentacao/contexto-negocio/` **não saiu** — continua aqui, porque o
script do agente (`docs/agente-ia/06-script/`) e a especificação linkam nele
por caminho relativo. Foi feita uma **cópia espelhada** em
`encorpa-campanhas/docs/contexto-negocio/`, com aviso no topo de cada arquivo
apontando de volta pra cá como fonte viva. Se preço, oferta ou claim mudar,
atualiza aqui primeiro — a cópia do outro repositório fica desatualizada até
alguém replicar manualmente.

---

## Em uma frase

A conversa vai do "oi" ao link de checkout, com guardrail, custo por chamada e handoff por
e-mail; a venda confirmada volta pelo webhook, mata a cobrança e arma o pós-entrega — tudo
verificado pela porta de produção, não por teste. **O que falta não é código, é operação:**
o WhatsApp ainda não tem canal, e a cota da OpenAI está esgotada.

---

## COMECE POR AQUI — estado em 2026-09-10

Quem pega esta sessão do zero lê **só esta seção** e o
[§Plano daqui pra frente](#o-plano-daqui-pra-frente). Depois, se precisar de número:
[`docs/operacao/plano-lacunas.html`](docs/operacao/plano-lacunas.html) (as dez lacunas em
quatro ondas) e [`docs/operacao/mapa-financeiro.html`](docs/operacao/mapa-financeiro.html)
(margem, taxas, ciclo de caixa).

Tudo abaixo de §Histórico é registro, não estado, **e contém afirmações corrigidas depois**
— nos prazos, no frete e no M. Onde divergir daqui, aqui vence.

### O que está no ar

| | Estado |
|---|---|
| Edge Function `turn` | **v30**. **Não é mais igual ao repositório** — três mudanças no repo aguardam deploy |
| Guardrails | **19 gates**, briefing no prompt |
| Testes | **2802**, lint, typecheck e `deno check` verdes; CI roda os quatro mais `typecheck:function` |
| Time de agentes | **10 especialistas** em `.claude/agents/`, com a tabela do `CLAUDE.md` satisfeita |
| Preço | R$ 129,90 nos dois caminhos, desconto zero — **⚠ decidido mudar em 10/09, ver Frente 4, nada implementado ainda** |
| Frete | Grátis pra cliente nos dois, R$ 15,00 fixo pago pela operação no antecipado — **⚠ idem** |
| Prazos | **1 a 3 dias** na entrega · **"varia por região, em média 5 dias úteis"** no antecipado |
| Consulta de região | dentro da agente — ela pede o CEP e sabe a cobertura antes de falar |
| Webhook de venda | **no ar**: Logzz e Coinzz → `job: "order"` → mata o silêncio, arma o pós-pedido |
| Pedido cancelado | **desarma a régua inteira** — não manda "sua entrega é amanhã" pra quem cancelou |
| Ritmo humano | `bubbles` volta junto do `reply`, confirmado em produção |
| Janela de 24h | `deliveryFor` decide texto livre × template pelo relógio |
| Atribuição | `leads.source` gravado com o `ctwaClid` na criação do lead |
| **Canal do WhatsApp** | **não existe.** Decisão: **Cloud API**, não WAHA. Frente do sócio |
| **Cota da OpenAI** | **ainda esgotada** — a previsão de 16:45 UTC falhou, ressondado 17:17 UTC ainda saturado. Ver Frente 0.1 |

### O que mudou em 2026-09-10 à tarde (código, não deployado)

Cinco coisas. Nenhuma está em produção, e nenhuma pode ir sem o operador.

1. **`CONVERSATION_MODEL` virou variável de ambiente** (`index.ts`), com
   `DEFAULT_CONVERSATION_MODEL = "gpt-5.6-luna"` como padrão — variável ausente se comporta
   exatamente como a v30. Resolve a Frente 3 item 1 na parte que era de código: **existe
   plano B para uma queda da OpenAI sem deploy.** Um modelo novo tem que trazer o preço
   junto (`CONVERSATION_MODEL_PRICE`, JSON `{"in":1.25,"out":4.25}`) ou a função **falha no
   boot** — de propósito: sem isso o custo por chamada gravado em `llm_calls` ficaria
   incomparável, e falhar antes de servir requisição é melhor que falhar no meio da
   conversa depois de gastar o token. Trocar de modelo continua sendo decisão do operador,
   e o eval do passo (b) continua não tendo sido rodado.
2. **`firstReplyAt` respeita o fuso de São Paulo** (`pacing.ts`), reusando
   `BUSINESS_TZ`/`offsetMinutes`/`nextOpening` da régua em vez de duplicar lógica de fuso.
   Resolve a Frente 3 item 2 antes de o canal a chamar. Os testes de `pacing.test.ts`
   codificavam a suposição errada e foram reescritos: quatro casos com instante UTC
   explícito, incluindo o que só quebra em runtime UTC.
3. **Frente 4, itens 1, 3, 4 e 5, feitos:** os três valores em
   `config/business.example.json` (`prepayBrl` 116,91 · `prepayDiscountPercent` 10 ·
   `freeShipping` false), os dois blocos de comentário que iam ficar mentindo
   (`guardrails.ts` e `availability.ts`, espelhados), e o teste que faltava — a combinação
   `freeShipping: false` **com** `prepayDiscountPercent: 10`, que nenhum teste cobria.
   Confirmado no código: **nada precisou mudar em `src/order/checkout.ts`** e as duas
   branches do `shipping_promise` já estavam prontas, como o handoff previa.
4. **A análise do item 6, e a premissa que caiu.** Ver o aviso no topo. Resumo: hoje a
   economia de R$ 12,99 é **verdade**, porque o checkout do antecipado cobra zero de frete.
   A meia-verdade nasce no dia em que o operador parametrizar frete na Coinzz — e a
   combinação que **faz a agente mentir hoje** é justamente `freeShipping: false` antes
   disso. **Não suba esse campo no secret ainda.**
5. **Dez agentes especialistas** em `.claude/agents/`, triados de um corpus de 209 e
   escritos contra este repositório: carregam o espelho byte a byte, o `??` do
   `BUSINESS_CONFIG`, a cegueira a negação e o default "NEEDS WORK". A tabela do
   `CLAUDE.md` deixou de ser aspiracional.
6. **Dois furos consertados, achados pelos revisores e não por teste.** Ambos com entrada
   concreta, e o primeiro é o mais grave que esta sessão produziu:
   - **`handoff_at` tornava a troca de modelo irreversível.** Apontar
     `CONVERSATION_MODEL` para um modelo que o endpoint não serve — inclusive por typo —
     fazia toda cliente virar `modelFailure`, que escreve `leads.handoff_at`. Esse campo
     **é escrito e nunca limpo**: desfazer a variável não desfazia o dano, e todo lead da
     janela ficava fora da agente para sempre, com os follow-ups cancelados pelo sweep.
     Agora erro de configuração é `ModelConfigError`, **não** marca o lead, e o nome do
     modelo é checado no carregamento contra provedores cuja API esta função não fala. E
     o erro deixou de derrubar o boot: o mesmo isolate serve o webhook de venda e o cron.
     **Isso também cobre a cota esgotada de 09/09** — os leads daquelas 20 horas foram
     trancados por esse mesmo caminho, e vale conferir no banco quantos estão assim.
     **Conferido em 2026-09-10 17:17 UTC: zero.** Sem canal de WhatsApp no ar, não havia
     tráfego real pra ficar preso — o risco era só teórico, mas valia checar antes de supor.
   - **`freeShipping: false` desligava o veto de valor de frete.** A branch fazia `return`
     cedo e levava embora a regra de valor, então "o frete do antecipado é R$ 12,99"
     passava em todos os gates — porque o `price_promise` só verifica se o número é um dos
     preços configurados, e preço configurado lido como frete continua sendo mentira.
     Agora o veto é sobre valor **atribuído** ao frete, mais estreito que valor perto da
     palavra: "São R$ 129,90 mais o frete" e "o frete já está dentro do preço: são
     R$ 129,90" continuam passando, porque são as frases honestas.

### O desenho — quem faz o quê, e por quê

A regra que decide tudo: **regra de negócio é código versionado com teste; credencial,
relógio e chamada HTTP são cano.** Quando bater dúvida sobre onde algo mora, é esta frase
que responde.

- **Edge Function `turn`** (Supabase, Deno) — o cérebro. Uma rota, três entradas:
  - corpo com `{ externalId, from, body }` → um turno de conversa;
  - `{ job: "followups" }` → a varredura das réguas, determinística, custo zero;
  - `{ job: "order", order: {...} }` → uma venda confirmada.
- **Supabase (Postgres)** — todo o estado: `leads`, `conversations`, `messages`, `orders`,
  `followups`, `llm_calls`, `gate_traces`, `jobs`, `hermes_proposals`.
- **n8n** (PikaPods, `encorpa-fashion.pikapod.net`) — cano e relógio, dois workflows:
  - `Encorpa — Turno da agente` (`HnGrxquQLpfbXWLH`) — webhook `/encorpa-inbound`, chama a
    Edge Function, devolve a resposta, e-mail de handoff, **e-mail de recusa**;
  - `Encorpa — Venda confirmada` (`gS72LhYGOnmyALRq`) — webhook `/encorpa-venda`, normaliza
    o payload da plataforma e posta `job: "order"`;
  - `Encorpa — Relógio da régua` (`SVDtFUi2N9oOskkx`) — cron de 5 em 5 minutos.
- **Logzz** — pagamento na entrega, a plataforma que agenda. **Coinzz** — antecipado.
- **Meta / WhatsApp Cloud API** — o canal. **Ainda não existe.**

**Duas cópias de cada arquivo, de propósito.** O Supabase sobe conteúdo de arquivo, não
resolve o repositório, então `src/agent/*.ts` e `supabase/functions/turn/*.ts` são **byte a
byte idênticos** e `tests/function-drift.test.ts` quebra no instante em que divergirem. São
oito arquivos espelhados mais duas cópias *inline* dentro do `index.ts` — a tabela `PRICES`
e o ritmo (`MS_PER_WORD`, `bubbleDelayMs`, `splitBubbles`) — cada uma presa à fonte por
teste. Mexeu num, copia no outro **antes** de rodar o teste.

### As decisões de negócio que não se reabrem

> **Os itens 1 e 3 foram reabertos em 2026-09-10** — ver
> [§Decisões de 2026-09-10](#decisões-de-2026-09-10-preço-frete-e-modelo-de-conversa).
> Ficam aqui porque o raciocínio por trás deles continua verdadeiro e é exatamente a tensão
> que a decisão nova reabre de olhos abertos — não é engano, é escolha consciente do
> operador. Onde os dois divergirem, a seção de 10/09 vence.

1. ~~**Um preço só: R$ 129,90 nos dois caminhos.**~~ **Reaberto em 2026-09-10 — volta a
   existir desconto no antecipado.** O raciocínio que zerou o desconto em 09-09 continua de
   pé e não foi refutado, só aceito como custo consciente: o antecipado paga frete que o COD
   não paga, então ao mesmo preço rende R$ 48,35 contra R$ 63,35 do COD, e mesmo desconto
   zero perdia R$ 4,00 contra o COD. A diferença agora é que **quem paga o frete extra é a
   cliente, não mais a operação** — o que muda a conta original. Ver Frente 4.
2. **O antecipado não é opção, é saída.** A agente só o apresenta quando o COD não alcança:
   praça sem cobertura, ou tamanho sem entrega naquela região. Onde o COD chega, existe um
   preço só e nenhuma escolha a fazer — uma pergunta a mais é uma decisão a mais, e uma
   decisão a mais é uma venda a menos.
3. ~~**A cliente não paga frete em nenhum dos dois.**~~ **Reaberto em 2026-09-10 — ela
   volta a pagar frete no antecipado**, calculado por região dentro do checkout da Coinzz.
   No COD continua embutido no preço, como sempre foi. Ver Frente 4.
4. **O prazo do antecipado não é faixa.** "Varia por região, em média 5 dias úteis",
   **sempre** dizendo que varia. O gate recusa a faixa, o número errado e o número certo
   dito como prazo fixo.
5. **`afterpay` é o pagamento na entrega** na Coinzz. Dos quatro métodos que ela aceita,
   nenhum se chama COD, e `afterpay` é o único que significa pagar depois.
6. **São duas ofertas, dois hashes.** `offerHash` (`offp16pv`, entrega) e `prepayOfferHash`
   (`offkw47x`, antecipado). Um hash só cobraria R$ 129,90 pela oferta errada.
7. **O M não é problema de estoque** — é parametrização de produtos da integração Logzz na
   Coinzz. A consulta de disponibilidade é confiável **por região, não por tamanho**, e por
   isso é feita com o G e nunca veta um tamanho.
8. **O tamanho vai no complemento do agendamento.** A página da Logzz não tem seletor; a
   instrução é do fornecedor, em maiúsculas, na descrição do produto.

### O que foi construído em 2026-09-09 à noite

Seis coisas, todas verificadas pela porta de produção e não por teste:

1. **Ramo de erro no n8n.** O nó do turno tem `onError: continueErrorOutput`. A recusa da
   Edge Function vira corpo `{ status: "error", error }` **e** e-mail com telefone,
   `externalId` e o que a cliente escreveu. Antes ela existia só no log de execução.
2. **Webhook de venda, das duas plataformas.** A rota `job: "order"` existia e verificada
   desde 09/09 de manhã, e **nada a chamava** — a régua de pós-pedido nunca armava e a de
   silêncio seguia cobrando quem já tinha comprado. Agora existe quem chame.
3. **Pedido morto desarma a régua.** `isOrderDead` lê o status por raiz. Cancelado, a régua
   inteira morre — pós-pedido e silêncio.
4. **A janela de 24h da Cloud API.** `deliveryFor` decide pelo relógio, não pelo tipo do
   toque. Fora da janela: template do config, ou bloqueio explícito.
5. **`pacing.ts` ligado.** Toda resposta devolve `bubbles` junto do `reply`.
6. **Dois defeitos silenciosos, achados por auditoria e sonda:** `prepayVariesByRegion` era
   decorativo (o gate nunca lia a chave), e a véspera de entrega ia para quem cancelou.

### As armadilhas que já custaram caro — leia antes de mexer

1. **`BUSINESS_CONFIG` sobrescreve o fallback INTEIRO.** A produção monta o config com
   `Deno.env.get("BUSINESS_CONFIG") ?? fallback`, e o `??` é sobre a variável, não campo a
   campo. Com o secret setado — e está — o objeto do código **nunca é lido**, e uma chave
   nova nasce **ausente** lá. `freeShipping` foi criada obrigatória, leu `false` em produção
   e reinstalou um veto com 2.738 testes verdes e o deploy dado como concluído.
   → **Campo novo em `BusinessConfig` nasce opcional, com o padrão certo para ausente.**
   O valor do secret **não é legível** pela API (vem hasheado); só o operador vê no painel.
2. **O status HTTP não é canal de erro.** O webhook do n8n responde **200 em qualquer
   desfecho**, de propósito: não-2xx faz o canal reentregar a mensagem, e reentrega sobre
   recusa é laço. Quem precisa reagir **lê o corpo**.
3. **O deploy pela ferramenta MCP não cabe.** São 199 KB. Deploy pela API de gerência, com
   os arquivos do disco, **nove** arquivos — `availability.ts` entrou depois da receita
   antiga. Ver [`.claude/memory/supabase-deploy-por-api.md`](.claude/memory/supabase-deploy-por-api.md).
4. **Isolate quente.** Por minutos depois de um deploy, parte das requisições ainda cai na
   versão anterior. Confira a sonda pelo **formato** da resposta, não pelo conteúdo.
5. **Cegueira a negação.** Toda heurística de texto deste repositório já errou em negação.
   Antes de mexer numa, sonde a frase negada **e** a negativa que não nega.
6. **Verificar pela porta de produção.** Sonda contra a Edge Function prova o código, não o
   caminho. O webhook do n8n já devolveu 200 sem criar conversa nenhuma por um dia inteiro.

### Decisões de 2026-09-10: preço, frete e modelo de conversa

Quatro decisões do operador na mesma tarde, tomadas fora do código — **nada abaixo está
implementado.** `config/business.example.json`, o secret `BUSINESS_CONFIG` e
`supabase/functions/turn/index.ts` continuam exatamente como a v30 descreve. O roteiro
exato de implementação está na [Frente 4](#frente-4--preço-frete-e-desconto-do-antecipado-decisão-de-2026-09-10)
(preço e frete) e no item 1 da [Frente 3](#frente-3--dívidas-técnicas-nomeadas) (modelo).

1. **Remover o frete fixo de R$ 15,00.** Deixa de existir um valor único que a operação
   paga por venda no antecipado. `LABEL_COST_BRL` em `availability.ts` fica obsoleto como
   número de custo — só continua existindo como registro histórico do que a margem sheet
   lia até aqui.
2. **O frete do antecipado passa a ser da cliente, calculado no checkout.** Não é um número
   novo fixo — é a Coinzz/Logzz calculando o frete real por região na hora do checkout, do
   jeito que `CheckoutPrices.prepayBrl` (`src/order/checkout.ts:47`) **já está documentado
   para funcionar**: "Product only. Freight is calculated separately inside the checkout."
   O COD não muda — frete continua embutido no preço, como desde sempre.
3. **Desconto do antecipado volta a 10%**, sobre os R$ 129,90 publicados:
   `prepayBrl = 129.90 × 0.90 = R$ 116,91`, `prepayDiscountPercent = 10`. Não é o 15% de
   antes de 09-09 (R$ 110,41) — é um número novo, mais conservador, porque agora ela paga
   frete à parte e o desconto de produto sozinho não pode fingir que cobre isso.
4. **Modelo de conversa: candidato a trocar de `gpt-5.6-luna` para Meta Muse Spark 1.3**
   (`$1,25/$4,25` por milhão de tokens). Dentro do teto de **R$ 0,50 por lead / 20
   mensagens** definido nesta sessão, é o modelo de maior Intelligence Index (53,0) com
   folga real de margem (R$ 0,32 de custo estimado, 36% abaixo do teto) — Grok 4.6 e Qwen3.8
   Max empatam em score mas encostam no teto (R$ 0,49, 3% de folga), risco demais pra uma
   estimativa que já é aproximada. **Não é decisão fechada de troca — é o candidato a
   testar.** Ver ressalva no item 1 da Frente 3.

---

## O PLANO DAQUI PRA FRENTE

Cinco frentes, na ordem em que destravam dinheiro. **Nada na frente 2 vale a pena antes da
frente 1 estar de pé**, e a frente 0 bloqueia as duas. A frente 4 é independente das outras
quatro — pode andar em paralelo, não trava nem é travada por elas.

### Frente 0 — o que trava hoje (operador, não código)

| # | O quê | Quem | Como se sabe que fechou |
|---|---|---|---|
| 0.1 | **Cota da OpenAI** | operador | A sonda de produção responde em vez de virar handoff |
| 0.2 | **Verificar o `BUSINESS_CONFIG`** | agendado | A agente diz R$ 129,90 nos dois caminhos |
| 0.3 | **Webhook da Coinzz** | operador + agente | Chega o primeiro payload real e o mapeamento fecha |

**0.1 — Cota da OpenAI. A previsão de "volta às 16:45 UTC" estava errada, e o motivo
importa mais que o erro.** Ressondado em 2026-09-10 17:17 UTC, quase meia hora **depois**
do horário em que devia ter voltado:

> `Rate limit reached for gpt-5.6-luna ... on tokens per min (TPM): Limit 100000,`
> `Used 98800, Requested 2702. Please try again in 10h48m51.84s.`

Ontem às 21:08 UTC: `Used 100000`, "tente em 19h36m". Hoje às 17:17 UTC — **9 horas depois
do instante em que os 19h36m acabariam** — ainda `Used 98800` de 100000, e a espera **subiu**
para 10h48m em vez de zerar. Isso não é um teto que reseta num horário fixo: é uma **janela
rolante** que continua saturada, o que só acontece se algo **continua consumindo** perto do
limite inteiro — e não é este projeto: não há canal de WhatsApp no ar, e as duas sondas desta
sessão (09/09 e 10/09) são as únicas chamadas de conversa que este código fez. **Ou a
organização da OpenAI tem outro consumidor usando a mesma chave, ou o teto de 100k TPM está
sub-dimensionado pra qualquer tráfego real.** Só o operador vê o painel
(platform.openai.com/account/rate-limits) pra saber qual dos dois é.

**O Gemini segue de pé**; morre só a chamada de conversa — confirmado de novo hoje
(classificação de intenção rodou, custou R$ 0,000084). Decisão do operador em 09/09 foi
**esperar, sem subir limite e sem trocar de modelo** — mas essa decisão foi tomada
acreditando num horário de retorno que não se confirmou. Vale reconfirmar com esse dado
novo. **Nenhum check-in automático foi reagendado** — a suposição de horário fixo já falhou
uma vez; reagendar às cegas de novo seria repetir o erro. Peça uma nova sonda quando quiser.

**0.2 — O `BUSINESS_CONFIG` foi salvo e ninguém confirmou que pegou.** Todo campo que mudou
— `prepayBrl`, `prepayDiscountPercent`, `prepayAvgDays`, `prepayVariesByRegion` — só aparece
no prompt e nos gates, e os dois vêm depois da chamada barrada. **Salvo ≠ verificado.**
Há um check-in agendado para **2026-09-10 17:15 UTC** (`trig_019zftJ8Zx3bLqWCky8HQter`) com
o roteiro inteiro: "oi" → tamanho → CEP → "qual a diferença?". Ele prova quatro coisas: os
dois preços em R$ 129,90, o prazo de 1 a 3 dias na entrega, a frase da média no antecipado,
e `bubbles` na resposta.

**0.3 — Coinzz.** A URL está colada no painel e **nenhum webhook real chegou ainda**. O
mapeamento dela é o esperado, não o confirmado. O primeiro que falhar vira e-mail com o JSON
cru — é esse e-mail que fecha a metade que falta.

### Frente 1 — a venda fecha sozinha

Tudo aqui está **em código e verificado**; o que falta é confirmar contra dado real.

1. **Confirmar o mapeamento da Coinzz** (depende de 0.3). O da Logzz já saiu de payload
   real: `external_id`, `client_phone`, `order_final_price` (o **total**, não o unitário —
   a quantidade pode ser > 1), `client_address_comp`, `order_status`, `date_order`,
   `date_delivery`.
2. **Conferir o primeiro pedido real ponta a ponta antes de abrir tráfego.** Método de
   pagamento errado cria cobrança que a cliente não combinou.
3. **Vigiar o e-mail de "venda não mapeada".** Todo tamanho que não passar cai ali. Se
   passar a cair muito, o texto da instrução do fornecedor precisa mudar, não o código.

### Frente 2 — o canal (WhatsApp Cloud API)

Frente do sócio do operador. **O lado do código está pronto e bloqueando de propósito.**

1. **Aprovar os templates na Meta.**
2. **Declarar cada um em `BUSINESS_CONFIG`**, sob `channel.templates`, com nome, idioma e a
   **ordem dos placeholders** — a aprovação fixa a ordem e o código não adivinha:

   ```json
   "channel": { "templates": {
     "silence_2":  { "name": "...", "language": "pt_BR", "variables": ["warrantyDays"] },
     "silence_3":  { "name": "...", "language": "pt_BR", "variables": ["weekday", "couponPercent"] },
     "order_eve":  { "name": "...", "language": "pt_BR", "variables": ["price", "size"] }
   } }
   ```

   Valores possíveis: `price`, `warrantyDays`, `size`, `address`, `couponPercent`,
   `weekday`. **Ausente bloqueia** todo toque fora da janela — texto livre lá a Meta
   recusaria de qualquer jeito, então barrar e dizer vence mandar no escuro.
3. **Ligar o envio.** Quem enviar lê `bubbles` (texto e atraso já calculados) e chama
   `presenceRefreshes` de `pacing.ts` pro "digitando". `firstReplyAt` é do relógio de quem
   envia, não da resposta.
4. **Contadores de pacing.** O gate `pacing` existe e a varredura **não passa contador
   nenhum** — eles pertencem ao canal. Ao ligar, dê ao chamador um **retry por hora**; não
   reuse o adiamento para a reabertura, que é certo pro limite diário e longo demais pro
   horário.

### Frente 3 — dívidas técnicas, nomeadas

Nenhuma trava venda hoje. Todas mordem depois.

1. ~~**`CONVERSATION_MODEL` é constante no código**~~ **✅ feito em 10/09 (não
   deployado).** Lê de `Deno.env.get("CONVERSATION_MODEL")` com `gpt-5.6-luna` como padrão,
   e um modelo novo tem que trazer `CONVERSATION_MODEL_PRICE` junto ou a função falha no
   boot. O plano B sem deploy passou a existir. **O que continua aberto é a decisão de
   trocar** — e o passo (b) abaixo, o eval, não foi rodado.

   **Candidato decidido nesta sessão: Meta Muse Spark 1.3**, dentro do teto de R$ 0,50 por
   lead / 20 mensagens (ver §Decisões de 2026-09-10). **Não troque direto em produção.**
   Ordem: (a) virar `CONVERSATION_MODEL` variável de ambiente, com `gpt-5.6-luna` como
   padrão — reversível sem deploy; (b) rodar eval com conversas reais do projeto
   comparando Luna × Muse Spark 1.3, medindo taxa de conversão e quantos gates recusam,
   não Intelligence Index; (c) só então trocar o padrão. O ponto fraco da recomendação é
   o alinhamento de segurança da Meta em atendimento comercial — é exatamente o que o
   eval do passo (b) testa.
2. ~~**`firstReplyAt` usa a hora local do runtime**~~ **✅ feito em 10/09 (não
   deployado).** Decide a janela pela hora local de São Paulo, reusando
   `BUSINESS_TZ`/`offsetMinutes`/`nextOpening` da régua. `pacing.test.ts` foi reescrito com
   quatro casos em instante UTC explícito, incluindo o que só quebra em runtime UTC.
   Ressalva registrada: `hours.timeZone` existe no tipo do gate mas não em
   `src/config/business.ts`, então o fuso é fixo em `America/Sao_Paulo`, igual à régua.
3. **Depoimentos e cupom estão vazios** no config. A agente não pode citar cliente nenhuma,
   e o toque `silence_3` (o do cupom) **não sai** — retorna `null` de propósito enquanto o
   cupom não existir na Coinzz. Anunciar cupom sem destino é a promessa quebrada que este
   projeto já decidiu nunca fazer.
4. **`prepayDaysMin`/`prepayDaysMax` continuam no tipo, ausentes de propósito.** Existem só
   para o gate poder recusar uma faixa contra uma configurada. Não preencha.

### Frente 4 — preço, frete e desconto do antecipado (decisão de 2026-09-10)

O código já foi escrito pensando nesse cenário — a maior parte é **trocar valor de
config, não escrever lógica nova**. Ordem exata:

1. ✅ **feito em 10/09** — `config/business.example.json`, três campos:
   - `prices.prepayBrl`: `129.9` → `116.91`
   - `prices.prepayDiscountPercent`: `0` → `10`
   - `delivery.freeShipping`: `true` → `false` — **mas ver o item 6: este é o campo que
     não deve subir no secret ainda**
2. **`BUSINESS_CONFIG` no Supabase** — os mesmos três campos, **só o operador consegue
   editar** (o secret não é legível pela API de gerência). Sem isso a produção não muda —
   ver a armadilha do `??` sobre a variável inteira.
3. ✅ **confirmado no código em 10/09.** **Nada muda em `src/order/checkout.ts`.** `amountFor` já lê `prepayBrl` como "produto
   só, frete calculado à parte no checkout" — é a assinatura do tipo `CheckoutPrices`
   desde que foi escrito. O `freeShipping: false` também não é comportamento novo: o gate
   `shipping_promise` em `src/agent/guardrails.ts:809-829` já tem a branch pronta e **já
   testada** (`tests/guardrails.test.ts:549` — "com freeShipping desligado, a regra antiga
   volta inteira") para exatamente essa combinação: COD com frete embutido no preço,
   antecipado com frete calculado por região dentro do checkout, nunca "frete grátis" nos
   dois. O `price_promise` gate (`guardrails.ts:385-431`) também já lê `prepayBrl` e
   `prepayDiscountPercent` direto do config para decidir o que é citável — nenhum dos dois
   precisa de código novo, só do valor certo entrando.
4. ✅ **feito em 10/09.** **Comentários que ficam mentindo se não forem atualizados** (não têm efeito em teste,
   mas confundem a próxima sessão):
   - `src/agent/guardrails.ts:791-808` — o bloco de comentário explica a troca de 09-09
     ("this gate used to forbid... now forbids denying"). Precisa de um terceiro parágrafo
     contando que a bandeira voltou a virar, e por quê.
   - `src/agent/availability.ts:244-252` — `LABEL_COST_BRL` está documentado como "she
     pays nothing for it on either path", que deixa de ser verdade no antecipado.
   - Espelhar as duas mudanças em `supabase/functions/turn/guardrails.ts` e
     `supabase/functions/turn/availability.ts` — são cópias byte a byte, `pnpm test`
     quebra sozinho se esquecer (`tests/function-drift.test.ts`).
5. ✅ **feito em 10/09.** **Teste novo:** a combinação `freeShipping: false` **junto com**
   `prepayDiscountPercent: 10` (os testes atuais cobrem cada campo separado, nunca os dois
   como a produção vai rodar). Confirma que a agente cita `R$ 12,99` de economia e `10%`
   de desconto sem citar frete grátis no antecipado.
6. **O item que precisa da sua decisão antes do deploy — e a premissa dele estava
   errada.** O gate `price_promise` vai liberar **"você economiza R$ 12,99 no
   antecipado"**, a diferença aritmética entre `codBrl` e `prepayBrl`. A versão anterior
   deste item dizia que o frete real cobrado dela seria de R$ 15 a R$ 40 e que ela
   portanto pagaria mais. **Aqueles números são custo do operador, não preço dela** — a
   oferta `encorpa-pagamento-antecipado-0` na Coinzz vem **sem frete configurado nos 27
   estados** (`settingsFreight: []`, medido na fonte e registrado neste próprio arquivo),
   então hoje o checkout cobra dela **R$ 0,00** e a economia de R$ 12,99 é **verdade
   literal**.
   
   A meia-verdade não existe ainda: ela nasce no minuto em que o operador parametrizar
   frete naquela oferta. O que **existe hoje** é o inverso — `freeShipping: false` faz a
   agente parar de dizer "frete grátis", que é verdade e é o melhor argumento dela, e
   passar a dizer que o frete é calculado no checkout, que é falso. **A decisão que vem
   antes das três saídas é: o operador vai configurar frete na Coinzz ou não?** A conta
   inteira, a análise de sensibilidade e as quatro combinações de preço × frete estão em
   [`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`](docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md). É exatamente o tipo de meia-verdade que os gates deste projeto
   existem para impedir, e é a mesma armadilha econômica que motivou zerar o desconto em
   09-09 — só que agora do lado da promessa, não do lado da margem. Três saídas, nenhuma
   escolhida ainda:
   - **A.** Tirar a economia de R$ 12,99 da lista de valores citáveis no `price_promise`
     (deixar só o desconto de 10% como número, nunca "economiza R$X").
   - **B.** Manter a citação, mas só o operador decide isso porque é uma opção comercial:
     aceitar que a frase é otimista sabendo que nem sempre é verdade.
   - **C.** Citar a economia só combinada com uma ressalva ("mais frete, calculado no
     checkout") — mais fiel, mais difícil de fazer o guardrail aceitar sem soar burocrático.
7. **Verificar antes de deployar:** `pnpm test && pnpm typecheck && pnpm typecheck:function`,
   depois sonda de produção nos dois caminhos confirmando R$ 116,91 + 10% no antecipado,
   R$ 129,90 sem menção a frete grátis no COD, e frete calculado no checkout (nunca um
   valor fixo) no antecipado.
8. **Documentos de negócio que citam "frete grátis nos dois" ou "preço único" como fato
   consolidado** — `docs/documentacao/contexto-negocio/`, `docs/agente-ia/06-script/` —
   não foram varridos nesta sessão. Buscar por "frete grátis", "R\$ 129,90" e "desconto"
   antes de considerar essa frente fechada.

### O que NÃO fazer

- **Não pular, desabilitar ou isolar teste** para ficar verde.
- **Não deployar sem `pnpm typecheck:function`** — é a única coisa que olha o código que a
  produção executa de verdade; o `tsconfig` não cobre aquele arquivo.
- **Não editar um dos espelhos sem editar o outro.**
- **Não criar campo obrigatório em `BusinessConfig`.** Ver armadilha 1.
- **Não mandar prazo do antecipado como faixa**, nem a média sem dizer que varia.
- **Não subir `freeShipping: false` no `BUSINESS_CONFIG`** antes de a oferta do
  antecipado na Coinzz ter frete parametrizado. É a única combinação que faz a agente
  mentir hoje — cobra frete que a operação não cobra, e empurra a cliente pro COD por um
  motivo inventado. Ver o item 6 da Frente 4, reescrito em 10/09.
- **Não deployar a Frente 4 sem decidir o item 6.**
- **Não deployar o `CONVERSATION_MODEL` apontando pra modelo novo sem rodar o eval** —
  a variável existe desde 10/09, o eval não.
- **Não reaproveitar o [PR #22](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/22)** —
  merjado em 2026-09-09. Trabalho novo recomeça a branch a partir da `main`.

### Higiene de segurança

Rotacionar: `service_role` da Supabase, chaves OpenAI e Gemini, tokens do Facebook. Dois
PATs da Supabase foram colados no chat em 2026-09-09 e **os dois já foram revogados** — o
segundo depois dos deploys v28, v29 e v30; um deploy novo precisa de token novo. E um print
de DevTools enviado numa sessão trazia telefone e CPF de uma cliente real: nada foi usado
nem gravado, mas print de aba Network carrega dado pessoal junto.

---

## Histórico — o que veio antes de 2026-09-09 à noite

> **Aviso.** Daqui para baixo é registro, não estado, e as seções antigas erram em quatro
> coisas que foram corrigidas depois:
>
> | Aparece lá | É isto hoje |
> |---|---|
> | prazo do antecipado "5 a 10" ou "3 a 10 dias úteis" | **não é faixa** — "varia por região, em média 5 dias úteis" |
> | antecipado a R$ 110,41, com 15% de desconto | **R$ 129,90**, desconto **zero**, e ele não é opção, é saída |
> | frete de R$ 24,98 cobrado da cliente | **zero** para ela nos dois caminhos |
> | o M "com estoque zerado no país" | **parametrização** da integração Logzz na Coinzz |
>
> Onde divergirem do COMECE POR AQUI, o topo vence.

## Onde o trabalho parou

### O elo que faltava para a venda fechar

> **Onde cada peça está, enquanto os PRs não mergeiam.** O laço de endereço, a bateria de
> conversas e a persuasão estão no
> [#16](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/16). A coleta de
> nome/e-mail/CPF, o corpo do pedido da Coinzz e a escassez ligada estão no
> [#17](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/17), que tem base no #16 —
> mergear na ordem. Contagem de testes: 2517 no #16, **2674** com o #17.

A cliente dizia "quero comprar" e a conversa **morria ali**. Nada coletava endereço,
nada coletava os dados que a Coinzz exige, e o checkout era mock. Três buracos, os três
fechados nesta sessão.

**1. O laço de endereço (§D2/§D5).** Existia escrito e desligado de propósito — gravar
endereço que ninguém conferiu é entrega perdida, e em COD isso é o frete duas vezes.
Ligado com a checagem que faltava: acumula ao longo dos turnos, pergunta **uma** coisa
por vez, lê de volta, e só o "sim" dela confirma. `confirmsAddress` recusa qualquer
resposta com correção — ler *"na verdade é 125"* como sim é como o pacote vai para a
porta antiga. Peça nova **desconfirma** o que já estava confirmado.

**2. Nome, e-mail e CPF** ([`src/agent/identity.ts`](src/agent/identity.ts)). A API da
Coinzz exige os três e a conversa **não pedia nenhum** — a venda não fecharia nem com a
credencial na mão. Mesma disciplina do endereço: acumula, uma pergunta por vez, e só
**depois** do endereço confirmado. Pedir CPF antes de ela decidir comprar é o jeito mais
rápido de matar a conversa; por isso ele é o último. O CPF é conferido pelos próprios
dígitos verificadores — `111.111.111-11` passa na aritmética e é exatamente o que alguém
digita para furar formulário.

**3. O pedido da Coinzz** ([`src/agent/coinzz.ts`](src/agent/coinzz.ts)). O turno devolve
`order` com o corpo pronto e uma chave de idempotência; o **n8n posta** com a credencial
dele. A divisão é a que o `CLAUDE.md` já fixava: regra de negócio é código versionado com
teste, credencial e chamada HTTP são cano. Nenhum token entra neste repositório, e a
`baseUrl` também não — ela mora no nó do n8n.

Faltando qualquer coisa, vem `orderBlocked` com o nome exato (`coinzz.offerHash`,
`customer.document`) em vez de um corpo pela metade, que vira pacote na porta de um
estranho.

**Duas coisas ficaram registradas como decisão do operador, não como inferência:**

- **`afterpay` é o pagamento na entrega** (2026-09-08). Dos quatro métodos que a Coinzz
  aceita — `afterpay`, `bank_slip`, `credit_card`, `pix` — **nenhum se chama COD**, e COD
  é o funil inteiro. `afterpay` é o único que significa pagar depois. Travado em teste,
  porque método errado cria cobrança que a cliente não combinou. **O primeiro pedido real
  precisa ser conferido ponta a ponta antes de tráfego.**
- **São duas ofertas, não uma.** O site linka dois checkouts:
  `encorpa-pagamento-na-entrega-0` (R$ 129,90) e `encorpa-pagamento-antecipado-0`
  (R$ 110,42). Um `offerHash` só teria cobrado **R$ 129,90 pela oferta de R$ 110,42**.
  `prepayOfferHash` é campo próprio, e a ausência dele recusa o pedido antecipado em vez
  de cair no hash errado.

**Onde achar os dois hashes:** as páginas de checkout são apps JS que buscam os dados por
API, então o HTML servido não os carrega. Aba Network do navegador no próprio checkout,
painel da Coinzz, ou o payload de um webhook de venda antiga. Formato do exemplo deles:
`offxxxxxxxx`.

### Persuasão: o que a agente ganhou permissão de fazer

O prompt era quase só lista de proibições, com teto de 45 palavras — handbrake de
conversão, não guardrail. Agora ela tem técnica e liberdade de usar quando julgar:
ancoragem nos R$ 216,50 publicados, reversão de risco, antecipar a objeção, fechamento
por escolha em vez de sim/não, espelhar a palavra dela ("barriguinha", não "abdômen"), e
sempre deixar uma pergunta viva. O teto virou juízo: curta por padrão, até três
parágrafos quando a objeção ou o fechamento merecem.

O prompt também diz **quem está do outro lado** — uma mulher que parou de usar uma roupa
de que gosta porque não se sentiu bem nela. Cena concreta em vez de elogio abstrato, e
proibido apontar defeito ou sugerir que ela precisa mudar. A honestidade entrou como
argumento, não ressalva: ela já ouviu promessa de emagrecimento antes e reconhece quem
não mente.

**Uma trava que ninguém tinha visto:** a prova social estava a cadeado. O gate
`invented_testimonial` recusa qualquer citação de cliente fora de `knownTestimonials`, e
**nada nunca alimentava a lista** — toda avaliação real era reescrita fora. Agora
`config.testimonials` chega na cadeia.

**Escassez ligada pelo operador.** `scarcity.allowUnverified: true` e `unitsLeft: 12`. A
chave abre a urgência e **nada mais**: com ela ligada, preço inventado, cupom inexistente
e promessa de emagrecimento continuam barrados, com teste travando os três.

### A bateria de conversas, e o defeito mais caro do projeto

780 casos: 100 roteiros de conversa em três escritas reais de WhatsApp cada
([`src/dev/chats.ts`](src/dev/chats.ts)), mais a cadeia inteira contra as frases que a
agente pode escrever ([`src/dev/simulate.ts`](src/dev/simulate.ts)). Roda por
`pnpm dev` **e** dentro do `pnpm test` — script que ninguém roda foi exatamente como o
`pnpm lint` ficou quebrado por meses.

**A tabela de tamanho do código discordava da que a cliente lê.** `sizeFromDressSize`
dizia que 42 é **M** e 46 é **G**. O site publica **42–44 = G** e **46–48 = GG**
(`Offer.tsx` :16-20), e a base de conhecimento repete. A agente estava indicando um
tamanho **menor** que a página onde a cliente leu a tabela, em todo degrau par — e
tamanho pequeno volta, o que em COD é o frete inteiro perdido. Pior: as sondas das
sessões anteriores ("42 → M", "46 → G") cimentaram o erro, e um teste o travava.

As duas escadas viraram um array só, então não podem mais divergir, e um teste percorre
a tabela publicada degrau a degrau.

**"Manequim" é jargão.** O operador apontou: quase ninguém usa a palavra, as clientes
dizem *"uso 42 de calça"*. A agente agora pergunta assim e aceita número ou letra. O
extrator continua entendendo "manequim" — quem usa a palavra não é punido por isso.

**Sapato virava cintura.** "Calço 38" está a uma letra de "calça 38", e o 38 ia para
`leads.size` como M.

**Seis promessas não tinham gate nenhum** — 13 de 16 frases fora do escopo passavam
inteiras. A cadeia foi de 11 para 17 gates:

| Gate novo | A frase que passava |
|---|---|
| `health_claim` | "corrige a sua postura e cura a dor nas costas" |
| `scarcity_claim` | "só restam 3 unidades", "a promoção acaba em 10 minutos" |
| `warranty_promise` | "você tem 30 dias", "troca quantas vezes quiser" |
| `shipping_promise` | "no antecipado o frete é grátis também" |
| `unavailable_offer` | "também temos calcinha modeladora", "pode retirar na nossa loja" |
| `installment_promise` | "dá pra parcelar em 3x" (na porta ela paga uma vez) |

O `price_promise` também passou a pegar a concessão sem número — *"eu tiro mais um
pouquinho"* compromete a loja com um preço que ninguém definiu.

**Três jeitos de ser ignorada, todos corrigidos.** *"Me tire **dessa** lista"* não era
opt-out (só *"da lista"* era), então quem pediu para parar continuava recebendo — o
único erro irreversível da lista. *"Tem alguém disponível pra falar?"* e *"não quero
falar com uma máquina"* deixavam quem pediu gente conversando com robô.

**2674 testes** no total (com o #17), contra 148 no começo da sessão. `pnpm dev` roda a bateria
da cadeia (811 casos); `pnpm dev:conversas` roda as 360 conversas completas (1645
verificações); o CI roda as duas.

**O log de decisões estava ensinando o erro.** A R9.1 registrava *"verificado em produção:
manequim 42 → M, 46 → G"* — e as sondas realmente devolveram isso. O que elas verificaram
foi **o código, não a tabela**. Uma sonda de produção confirma que o código faz o que o
código diz; ela não confirma que o código concorda com o que a loja publicou. As duas
entradas ganharam nota de correção, porque uma sessão futura leria os números antigos como
verdade.

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

### A venda inteira, pelo webhook de produção

Sete turnos, do "oi" ao link, entrando pela mesma porta que a cliente usará. **`rewrites: 0`
em todos**, **zero vetos** na conversa inteira, custo total **R$ 0,0197**.

| Turno | Resultado |
|---|---|
| "oi, vi o anúncio" | abriu dizendo que **não emagrece**, com o preço e a pergunta de tamanho |
| "quanto custa?" | R$ 216,50 → R$ 129,90, e R$ 110,41 antecipado |
| "uso 42 de calça" | **G**, e citou as 12 unidades que o operador declarou |
| "quero comprar" | pediu o nome. **Nenhum pedido de endereço em turno nenhum** |
| nome → e-mail → CPF | um de cada vez, CPF por último |
| CPF | **o link**, e a mensagem dizendo que o pedido só nasce no checkout |

Estado final do lead: `size: G`, identidade completa e correta, `address: null`,
`handoff_at: null`, 14 mensagens, 3 toques armados, **0 blocos de guardrail**. O link
respondeu HTTP 200 com os quatro parâmetros. Dados de teste apagados.

Zero vetos numa conversa inteira é o `gateBriefing` fazendo o trabalho dele: a agente
escreveu dentro das regras em vez de descobri-las sendo recusada.

### A porta de produção estava fechada, e ninguém sabia

Descoberto ao testar o e-mail de handoff pelo webhook real, em 2026-09-08. **Toda
verificação anterior deste projeto chamou a Edge Function direto** — o que prova o
código, e não o caminho.

O nó `Cerebro do turno` autenticava na Supabase com a credencial **`Gemini API`**. A
Supabase recusava com `UNAUTHORIZED_INVALID_JWT_FORMAT`, nenhuma conversa nascia,
nenhuma mensagem era respondida. A credencial já tinha se chamado "Header Auth account":
foi renomeada e teve o valor trocado quando as APIs de modelo foram cadastradas, e levou
o turno junto.

E era silencioso **por configuração**: o nó estava com `neverError`, então o erro voltava
como **HTTP 200 com o erro dentro do corpo**. Webhook verde, execução verde, banco vazio.

Corrigido: credencial própria (`Supabase service_role`), `neverError` desligado, e a
regra registrada em
[`.claude/memory/verificar-pela-porta-de-producao.md`](.claude/memory/verificar-pela-porta-de-producao.md).
Sonda que não entra pelo webhook não verifica a entrada; e depois de sondar, confira o
banco — se nenhum lead nasceu, não importa o que o HTTP devolveu.

### O aviso de handoff, funcionando

`Encorpa — Turno da agente` ganhou um ramo paralelo: `É handoff?` (checa `status` **e**
`notify`) → `Avisa o operador` (SMTP do Gmail, três tentativas, falha visível). O ramo é
paralelo de propósito — a resposta ao webhook sai antes, sem esperar o SMTP.

Verificado ponta a ponta pelo webhook de produção: o Gmail respondeu
`250 2.0.0 OK`, `accepted: ["rdvaroto@gmail.com"]`, remetente `rodrigo.varoto@gmail.com`
(tem de ser a conta que autentica no SMTP, senão o Gmail recusa). O e-mail leva motivo,
telefone, **link `wa.me`**, o que a agente disse a ela, os ids e o custo.

### Deployado e verificado em produção — Edge Function na versão 17

A venda fecha, do "oi" ao link, verificada contra o modelo real. **`rewrites: 0` em todos
os turnos**, custo de uma conversa completa: **R$ 0,011**.

| Turno | O que saiu |
|---|---|
| "quanto custa?" | R$ 129,90 na entrega e **R$ 110,41** antecipado — o preço que o checkout cobra |
| "uso 42 de calça" | **G**, pela tabela publicada |
| "quero comprar" | pede o nome; **não pede endereço em momento nenhum** |
| nome → e-mail → CPF | uma coisa de cada vez, CPF por último |
| CPF | **o link, com os quatro campos preenchidos**, e a mensagem dizendo o que falta lá dentro |

O link que saiu:
`.../encorpa-pagamento-na-entrega-0?name=Maria+Aparecida+Souza&email=…&phone=…&document=…`
— e a agente disse, sem ninguém mandar, que o pedido nasce quando ela terminar o checkout.

**Duas falhas que só a produção pegou**, as duas corrigidas com teste e redeployadas:

1. **O gate de garantia lia o prazo de entrega como garantia.** *"Entrega em 3 a 5 dias e
   você tem 7 dias para trocar"* — o `5` cai a trinta caracteres de "trocar", dentro da
   janela de quarenta que o gate varre. Veto, reescrita, e a cliente que tinha acabado de
   dizer **"quero comprar"** recebeu a resposta de saída. O turno mais caro do funil,
   perdido por uma frase que o próprio prompt manda dizer.
2. **O nome da cliente virava complemento de endereço.** O lead de "Maria **Ap**arecida
   Souza" gravou `{"complement": "Ap arecida"}`: o padrão abria a palavra com `\b` e não
   fechava, então toda abreviação curta casava dentro de outra maior. No caminho por API
   isso ia impresso no pacote.

**Como deployar agora.** Pela API de gerência, com os arquivos do disco — ver
[`.claude/memory/supabase-deploy-por-api.md`](.claude/memory/supabase-deploy-por-api.md).
A ferramenta MCP transcreve o conteúdo inline e os oito arquivos passaram de **138 KB**,
que não cabe numa mensagem. Ganho colateral: enviado do disco, o que está no ar é **byte a
byte** igual ao repositório — os oito conferidos.

### Deployado e verificado em produção — Edge Function na versão 14

A v14 subiu do `main` mergeado (`3c94790`), depois dos quatro comandos canônicos verdes
(2674 testes) e de ler o que estava no ar. A v13 não tinha nada exclusivo: toda linha que
só existia lá era a versão velha do que o repositório já havia substituído. Os oito
arquivos foram conferidos **byte a byte** contra o repositório depois do deploy —
idênticos, uma vez desfeitos os escapes `\uXXXX` que o JSON do deploy converte em
caractere literal.

**A migração que nunca tinha sido aplicada.** `0004_order_identity.sql` existia no
repositório e **não estava no banco**: `leads.identity` não existia. O handler grava nela
com `.catch(() => undefined)`, então a coleta de nome, e-mail e CPF falhava **em silêncio**
— nada acumulava entre turnos e o pedido nunca poderia nascer. Aplicada nesta sessão. O
`list_migrations` mostrava oito migrações; o repositório tem nove. **Conferir as duas
listas faz parte de deployar, não só o código.**

Nove sondas contra o Supabase real, todas `rewrites: 0`:

| Sonda | Esperado | Obtido |
|---|---|---|
| "não uso 40, uso 46" | **GG** (tabela publicada) | ✅ GG, e `leads.size = GG` — a v13 dizia G |
| "uso 42 de calça" | **G** | ✅ G — a v13 dizia M |
| "calço 38, serve pra mim?" | não gravar tamanho | ✅ `size: null`, e ela perguntou o tamanho de calça |
| "você é um robô?" | responder de primeira | ✅ *"Sou a assistente virtual da Encorpa"* |
| "me dá 30% que eu fecho" | recusar sem ser vetada | ✅ ofereceu os 15% reais, sem citar 30% |

E o laço inteiro da venda, que nunca tinha rodado em produção: endereço acumulado e lido
de volta (**CEP 13010-100 não virou o número da casa** — 125), `addressReady: false` até o
"isso mesmo" dela, identidade acumulando entre turnos (`email` no turno 5, `document` no
turno 7, CPF só em dígitos e validado pelos verificadores), `name` gravado em outra
conversa, e `orderBlocked: ["coinzz.offerHash"]` em todas — que é exatamente o que falta.
Régua de silêncio agendada nas oito conversas, tokens gravados sem zero. Custo total:
**R$ 0,0256**. Dados de teste apagados; banco conferido, zero órfãos.

**Uma armadilha nova, registrada em
[`.claude/memory/edge-function-warm-isolate.md`](.claude/memory/edge-function-warm-isolate.md):**
por vários minutos depois do deploy, parte das requisições ainda é servida pela **versão
anterior**. Cinco sondas voltaram no formato de resposta da v13 (sem `order`,
`orderBlocked`, `size`) e o que elas escreveram no banco foi o comportamento velho. Não é
defeito: é janela de rollout. Sonda logo depois de deployar precisa ser conferida pelo
**formato da resposta**, não só pelo conteúdo.

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
| Extrator + laço de endereço (§D2/§D5) | `src/agent/address.ts` (espelhado) | ✅ Ligado ao turno: acumula, pergunta uma coisa por vez, lê de volta, e só o "sim" dela confirma |
| Coleta de nome, e-mail e CPF | `src/agent/identity.ts` (espelhado) | ✅ O que a API da Coinzz exige e a conversa não pedia. CPF conferido pelos dígitos verificadores |
| Corpo do pedido da Coinzz | `src/agent/coinzz.ts` (espelhado) | ✅ Montado no turno, postado pelo n8n. Falta só o `offer_hash` das duas ofertas |
| Contrato de checkout + mock (§E1/§E2) | `src/order/checkout.ts` | ⚠️ 10 testes, **mock** — substituído por `coinzz.ts` no caminho real |
| Bateria da cadeia · conversas completas | `src/dev/simulate.ts`, `src/dev/run-conversations.ts` | ✅ 811 casos + 360 conversas, rodando no `pnpm test` e no CI |
| Ritmo humano (atraso por bolha, "digitando") | `src/agent/pacing.ts` | ✅ 6 testes |
| Réguas de silêncio (3 toques) e pós-pedido (4 mensagens) | `src/agent/followups.ts` (espelhado em `supabase/functions/turn/followups.ts`) | ✅ 15 testes, rodando por cron em produção |
| Seam de chamada de modelo (teto de custo, custo por chamada) | `src/llm/seam.ts`, `src/llm/pricing.ts` | ✅ 5 testes |
| Adapters de modelo | `src/llm/providers/{openai,gemini}.ts` | ✅ Verificados contra as contas reais |
| Contrato de canal + adapter simulado | `src/channel/contract.ts`, `src/channel/simulated.ts` | ✅ É o que permite tudo acima rodar sem WhatsApp |
| Schema do banco | `supabase/migrations/0001_init.sql` … `0004_order_identity.sql` | ✅ As quatro aplicadas — a `0004` só nesta sessão; sem ela `leads.identity` não existia e a coleta falhava em silêncio |
| Handler do turno (o cérebro) | `supabase/functions/turn/index.ts` | ✅ **Deployado** como Edge Function `turn` (versão 17), conferido byte a byte; a venda inteira verificada contra o modelo real |
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

- **Prazo de entrega real: 1 a 3 dias no pagamento na entrega, 5 a 10 dias úteis no
  antecipado** (R9.3, conferido num pedido real em 2026-09-08 — não é 7 a 14, e também não
  é os 3 a 5 que a rodada 7 fixou de ouvido). No pagamento na entrega **quem escolhe o dia
  é a cliente**, dentro do checkout. O guardrail de prazo escolhe a janela pelo caminho de
  pagamento, e sabe distinguir promessa (pré-venda, veta) de fato já agendado (logística,
  libera) — mesma frase, efeito oposto, ver R8.1.
- **Divergência com o site: fechada.** FAQ e página de obrigado do Encorpa-Website foram
  alinhados às duas janelas em 2026-09-08.
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
- **Desconto antecipado:** 15%, ou seja **R$ 110,41**. A frase antiga aqui — *"o frete do
  antecipado fica com a cliente"* — **é falsa e foi corrigida em 2026-09-09**: a oferta
  antecipada não tem frete configurado em nenhum dos 27 estados, então a cliente paga
  R$ 110,41 fechados no Brasil inteiro e o envio é custo do operador (R$ 17,78 em São Paulo
  a R$ 84,05 em Altamira).
- **Preço do pagamento na entrega: R$ 154,88** — R$ 129,90 do colete mais R$ 24,98 de frete,
  constante em todas as praças onde o COD existe. O prompt da v18 ainda diz "R$ 129,90 com
  frete incluído", que está errado e é a correção mais urgente de código.
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

A conversa inteira está ligada e verificada contra o modelo real: ela vende, indica o
tamanho, coleta nome/e-mail/CPF e manda o link com os dados preenchidos. **Nenhuma linha
de código de conversa falta.** O que resta é operação:

1. ~~Conferir o primeiro pedido real ponta a ponta.~~ **Feito em 2026-09-08.** O operador
   fez um pedido de verdade pelo checkout e depois o cancelou. Foi o que devolveu as duas
   janelas de entrega (R9.3) — e o que expôs o frete, abaixo.
2. ~~O fluxo de n8n que manda o e-mail de handoff.~~ **Feito e verificado** — ver a seção
   acima. A agente promete chamar alguém e agora alguém é chamado.
3. **O frete do pagamento na entrega. Decisão do operador, e a mais cara em aberto.** O
   checkout do pedido real somou **Pedido R$ 129,90 + Frete R$ 24,98 = R$ 154,88**. Tudo
   aqui — o prompt, o briefing do `shipping_promise`, o site, o caso 387 do
   `src/dev/simulate.ts` — afirma que *no pagamento na entrega o frete já está incluído*, e
   o `price_promise` só admite 129,90 / 110,41 / 216,50, então a agente **não consegue nem
   dizer o total verdadeiro**. Isso é exatamente a recusa na porta que o funil inteiro
   existe para evitar: ela combina 129,90 no WhatsApp e o entregador cobra R$ 154,88. Duas
   saídas, e só o operador escolhe: **(a)** zerar o frete do COD na configuração da oferta,
   e aí tudo o que está escrito volta a ser verdade; **(b)** assumir o frete à parte, e aí
   muda o preço no prompt, no guardrail, no site e no script. Nada de tráfego antes disso.
4. **Disponibilidade por tamanho e por região — não sabemos o que acontece.** Ninguém
   testou o que o checkout faz quando o tamanho indicado não tem estoque para o CEP dela, e
   a agente não tem nenhuma fonte de estoque para consultar antes de indicar. Ver a seção
   abaixo.

### O caminho por API, que fica para depois

`order`, `orderBlocked` e `buildCoinzzRequest` continuam no código, prontos e desligados.
Eles criam o pedido sem o clique dela, o que converte mais — e não devem ser ligados antes
de duas coisas que só um pedido real responde:

- **O `payment_method` correto.** As duas ofertas estão com `pay_on_delivery: 0` e
  `pag_afterpay: null` no painel; quem entrega o pagamento na entrega é o app **OmniCash
  (tipo `logzz`)**, não uma flag da oferta. `afterpay` continua sendo dedução, não fato.
- **O dia da entrega e o tamanho.** A cliente escolhe os dois dentro do checkout (três
  datas, e um seletor de variação). Um pedido criado por API não tem quem escolha, e o
  tamanho tem hash próprio por variação, e agora os cinco estão conferidos (tabela na
  seção da disponibilidade, abaixo) — `buildCoinzzRequest` ainda não os manda.

Os dois `offer_hash` já estão no `BUSINESS_CONFIG`: `offp16pv` (na entrega) e `offkw47x`
(antecipado).

---

## O QUE A CONSULTA REVELOU — leia antes de qualquer decisão de tráfego (2026-09-08)

`pnpm dev:estoque` roda a consulta de fora do navegador e reproduz tudo abaixo em vinte
segundos. Dezesseis CEPs, cinco tamanhos cada. Três achados, e os três mudam o negócio, não
o código.

### 1. O pagamento na entrega cobre 22 das 43 cidades testadas

A varredura completa está em
[`docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md`](docs/agente-ia/07-cobertura/01-cobertura-pagamento-na-entrega.md).
**A primeira leitura desta seção dizia "seis regiões metropolitanas" e estava errada** — ela
saiu de dez CEPs; com 43, aparecem também Salvador, Fortaleza, Goiânia, Teresina, Natal,
Porto Alegre e Caxias do Sul.

Não muda a conclusão, muda o tamanho dela: o funil inteiro foi desenhado em cima do
pagamento na entrega, e ele cobre metade das praças e **nunca os cinco tamanhos**. São dois
ou três por cidade, e quais mudam por praça — São Paulo tem G/GG/XGG e não tem P, o Rio tem
P/GG/XGG e não tem G. Fora dessas praças, e fora desses tamanhos, a única venda possível é a
antecipada.

### 2. O tamanho M está indisponível nas 43 cidades

Nem na entrega, nem no antecipado — o `local_operation` volta vazio só para ele, e só ele.
M é o tamanho mais pedido de qualquer peça feminina. Hoje, agora, a agente indica M para uma
boa fatia das clientes e **nenhuma delas consegue comprar**. Isto não espera onda nenhuma.

A disponibilidade é por tamanho **e** por praça, sem padrão: no Rio, P existe e G não; em
Belo Horizonte, G existe e GG não.

### 3. O frete do pagamento na entrega é constante: R$ 24,98

Onde existe, é sempre R$ 24,98 — nunca variou nos dezesseis CEPs. Isso resolve a decisão do
frete que estava em aberto: **não é "varia por região", é um número só.** O total do
pagamento na entrega é **R$ 154,88**, sempre. Dá para dizer um número fechado sem consultar
nada, ou zerar o frete na oferta e subir o produto para R$ 154,88 — o efeito é o mesmo, e
some a surpresa na porta.

**E o antecipado é frete grátis nacional, confirmado na fonte.**
`POST /checkout/entrega/getAll` com `urlOffer=encorpa-pagamento-antecipado-0` devolve *sem
frete configurado* nos 27 estados, e o `settingsFreight` daquela oferta vem `[]`. Logo a
cliente paga **R$ 110,41 fechados em qualquer lugar do Brasil**, em qualquer tamanho menos o
M. O `local_operation` — de R$ 17,78 em São Paulo a R$ 84,05 em Altamira — **é custo do
operador, não preço da cliente**. Em praça distante ele come mais da metade da venda.

### 4. Um bloqueio que a agente precisa saber ler: pedido pendente

`has_pending_cash_on_delivery` vem por CPF, e quando é `true` o checkout do pagamento na
entrega **trava inteiro** (é a oferta que só tem `billing_moments = on_delivery`). Uma
cliente que começou um pedido na entrega e não terminou não consegue abrir outro. Está na
mesma resposta do `stock-and-delivery-day`, então a agente pode ler e desviar para o
antecipado em vez de mandar a cliente bater numa porta trancada.

### 5. O que mais o checkout expõe, tudo sem autenticação

| Chamada | Para quê |
|---|---|
| `GET /checkout/stock-and-delivery-day` | disponibilidade, frete e as três datas |
| `GET /checkout/get-variations?product_id=79880` | os cinco tamanhos e seus códigos |
| `POST /checkout/entrega/getAll` (`urlOffer`, `state`) | a configuração de frete da oferta, por estado |
| a própria página do checkout | `offer_id`, `offerPrice`, `billing_moments`, `settingsFreight`, métodos de pagamento |
| `POST /checkout/finalize` | cria o pedido — existe, e continua desligado por decisão de 2026-09-08 |

Duas coisas confirmadas lendo o `new-checkout-two.js`, não deduzidas: só `name`, `email`,
`phone` e `document` são lidos da query string (nada de tamanho ou endereço), e o próprio
código da Coinzz traz o comentário *"Verifica os arrays diretamente, não as flags (que vêm
incorretas da Logzz)"* — que é exatamente o erro de leitura registrado acima.

O checkout tem ainda um `prePopulatedVariations`, renderizado pelo servidor e hoje vazio.
Não vem por query string (testadas oito grafias). Se for uma opção da oferta no painel, é o
caminho para mandar o link já com o tamanho escolhido.

---

## A consulta de disponibilidade existe, e chama `stock-and-delivery` (2026-09-08)

Achada pelo operador no DevTools do próprio checkout. Três chamadas importam, todas XHR:

| Chamada | Devolve |
|---|---|
| `get-variations?product_id=79880` | os cinco tamanhos e o **código de produto de cada um** |
| `getAll` | a integração de pagamento na entrega: OmniCash, `type: logzz`, `app_integration_detail_id: 25458`, `freight_integration_id: 73270`, `cash_on_delivery_value: "R$ 0,00"` |
| `stock-and-delivery?…` | **estoque e datas de entrega para aquele CEP e aquele tamanho** |

**Os cinco códigos, conferidos.** O produto-pai é `79880`; cada tamanho é um produto próprio:

| Tamanho | `product_id` | `code` | `variation_id` |
|---|---|---|---|
| P | 79886 | `pro4gpo2` | 61777 |
| M | 79887 | `proqvqmj` | 61778 |
| G | 79888 | `pro7ml00` | 61779 |
| GG | 79889 | `pro66jdm` | 61780 |
| XGG | 79890 | `proe50v0` | 61781 |

**O payload do `stock-and-delivery`**, do jeito que o checkout manda: `customer_phone_ddi`,
`customer_phone`, `customer_document`, `products[0][product_id]` (o pai, 79880),
`products[0][code]` (o do tamanho), `products[0][quantity]`, `zip_code`, `city`, `state`,
`neighbourhood`, `number`, `app_integration_detail_id`, `freight_value`, `sale_type`,
`billing_moments[]`, `check_to_finish`.

**A resposta do "não", capturada num CEP de São Paulo com M indisponível no COD:**

```json
{"type":"success","status":200,"data":{
  "products":[{"code":"proqvqmj","stock":"1","delivery_date":null}],
  "has_local_operation_cash_on_delivery": false,
  "has_pending_cash_on_delivery": true,
  "delivery_date": null,
  "local_operation_cash_on_delivery": {"bumps":[]}
},"show":false}
```

**Leia com cuidado, porque as duas leituras óbvias estão erradas.** O `stock` diz `"1"`
sempre, inclusive para tamanho indisponível. E `has_local_operation_cash_on_delivery` diz
`false` **inclusive quando o pagamento na entrega está disponível** — foi a primeira leitura
registrada aqui, e ela não se sustentou contra dezesseis CEPs. Quem responde é
**`local_operation_cash_on_delivery.delivery_days_available`**: vazio é não; preenchido traz
`deliveryPrice` (o frete) e `dates` (as três datas que o checkout vai oferecer).

**As quatro perguntas em aberto, todas respondidas em 2026-09-08:**

1. **A URL.** `GET https://app.coinzz.com.br/checkout/stock-and-delivery-day`.
2. **A resposta de "sim".** Traz `deliveryPrice` e três `dates` — exatamente as que o checkout
   oferece. Confirmado em seis praças.
3. **O frete sai daqui**, sim: `deliveryPrice`, constante em R$ 24,98.
4. **Só o CEP importa.** Telefone, CPF, bairro e número podem ser sintéticos e não mudam a
   resposta; cidade e UF saem do próprio CEP pelo ViaCEP. **Nenhum cookie, nenhum CSRF,
   nenhum token** — o endpoint é público. Logo a agente pode consultar pedindo **uma coisa
   só: o CEP**, antes de indicar tamanho.

`src/dev/availability.ts` (`pnpm dev:estoque`) roda tudo isso de fora do navegador, com os
três erros de leitura documentados no cabeçalho.

---

## v18 no ar (2026-09-08)

`turn` v18, com as duas janelas de entrega de R9.3 e o gate escolhendo a janela pelo caminho
de pagamento. Rota de deploy: a mesma Management API multipart de v15-v17. **O que a v18
ainda não corrige é o frete** — o prompt continua dizendo "R$ 129,90 com frete incluído",
que o checkout desmente. Isso espera decisão registrada abaixo.

---

## Estoque por tamanho e por região — as três perguntas, respondidas (2026-09-09)

O operador levantou o risco que mais ameaça a escala. As três perguntas dele já têm resposta
medida, não deduzida:

1. **O que acontece se ela escolher um tamanho sem estoque na região?** O checkout deixa
   selecionar e só então abre o pop-up *"Não há disponibilidade do produto para o CEP
   solicitado"*. Atrás dele há uma consulta pública — ver a seção do `stock-and-delivery-day`.
2. **A agente consegue checar antes de indicar?** **Sim, e barato.** A consulta é pública e
   só o CEP muda a resposta. Falta escrevê-la dentro da agente: hoje ela só existe em
   `src/dev/availability.ts`.
3. **Dá para ter mais de um fornecedor?** Continua sendo decisão de operação, e ficou menos
   urgente: o gargalo medido não é "poucas peças por região", é **um tamanho zerado no país
   inteiro** e uma cobertura de COD que é metade do mapa. Um segundo fornecedor não resolve
   nenhum dos dois sozinho.

**A ponte barata está confirmada.** Quando o pagamento na entrega não existe — por praça ou
por tamanho — o antecipado existe: todas as 43 cidades, todos os tamanhos menos o M, R$
110,41 com frete grátis. A venda não está perdida, ela muda de caminho. Falta só a agente
saber disso na hora certa.

---

## O que fazer em seguida

Em ordem, e a ordem importa: os itens 1 e 2 mudam o que os outros devem fazer.

1. **Destravar as quatro decisões do topo com o operador.** Nenhuma é técnica, todas
   bloqueiam código. A mais urgente é o M.
2. **Resolver o estoque com a Logzz** — o M em todo o país, e o mapa de cobertura do
   pagamento na entrega. Rodar `pnpm dev:estoque` de novo depois de qualquer reposição:
   a varredura commitada é fotografia, não tabela fixa.
3. **Levar a consulta de disponibilidade para dentro da agente.** Escopo já definido, e não
   depende de mais nenhuma descoberta:
   - a agente pergunta **o CEP** antes de indicar tamanho (uma pergunta, não o endereço);
   - cidade e UF saem do CEP pelo ViaCEP; telefone, CPF, bairro e número podem ser
     sintéticos na consulta;
   - lê `local_operation_cash_on_delivery.delivery_days_available` (vazio = sem entrega) e
     `local_operation` (vazio = sem antecipado), **nunca** `stock` nem as flags `has_*`;
   - relê a consulta com o CPF real depois de coletá-lo, para pegar
     `has_pending_cash_on_delivery` e desviar para o antecipado em vez de mandar a cliente
     para um checkout travado;
   - guardrail novo: a agente não pode indicar tamanho sem disponibilidade confirmada;
   - espelhar em `supabase/functions/turn/`, com teste de drift, e redeployar.
4. **Alinhar preço e caminho padrão ao que a decisão 2 e 4 disserem** — prompt, briefing do
   `shipping_promise` e do `price_promise`, site e o caso 387 do `src/dev/simulate.ts`, que
   hoje afirma que no pagamento na entrega o frete já está incluído. **Isso é falso e ainda
   está no ar na v18.**
5. **Configurar as três URLs de obrigado** no painel da Coinzz (aba Redirecionamento da
   oferta): AfterPay → `https://encorpa-fashion.com.br/obrigado`; PIX e Cartão →
   `.../obrigado?pago=antecipado`.

Sem prazo de código, mas com prazo de calendário:

6. **Comprar o chip do WhatsApp e usá-lo como número comum.** Número novo precisa de semanas
   de uso normal antes de tráfego pago. O escolhido é **(11) 98859-0594**; nada o consome
   até o WAHA existir.
7. **Rotacionar as credenciais** listadas na higiene de segurança, no topo.
8. **Onda A4** (Hermes, conversão de volta para o Meta) e o `HANDOFF.md` do
   **Encorpa-Website** — a relação é de mão dupla.

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
| [`encorpa-campanhas`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-) (repo separado) | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API. Saiu deste repositório em 2026-09-08 — ver §Separação de repositórios abaixo. |
| `src/`, `supabase/functions/turn/`, `tests/` | O código do agente — ver a tabela "O que já existe em código" acima. |
