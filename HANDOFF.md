# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive **todo** o
> contexto do projeto — negócio, pesquisa, especificação, decisões — e onde o
> agente de IA de vendas via WhatsApp está sendo construído. O outro
> repositório, `colet-cinta-modeladora` (renomeado para **Encorpa-Website**),
> guarda só o site oficial da Encorpa (landing page, checkout) e um
> `HANDOFF.md` resumido específico dele. Se um dia os dois divergirem sobre
> negócio, **este repositório é a fonte**.

> Atualizado em: 2026-09-06

---

## Em uma frase

O agente saiu do papel: onda A0 e metade da A3 já rodam em produção contra o
banco real, com uma conversa completa (turno + guardrails + custo) e as duas
réguas de acompanhamento (silêncio e pós-pedido) funcionando por cron —
**tudo isso sem número de WhatsApp**, contra um contrato de canal que o WAHA
vai preencher quando o número existir.

---

## Onde o trabalho parou

### Trabalho desta sessão

Branch `claude/handoff-continuacao-gs6x7x`, Edge Function na **versão 8**:

1. **R8.4 corrigido** — o recomendador de tamanho determinístico é chamado
   pela Edge Function, verificado em produção. Seção dedicada mais abaixo.
2. **`leads.size` passou a ser gravado** — nada escrevia nele, e a régua de
   pós-pedido saía com "Colete tamanho **—**" para a cliente ler.
3. **Extrator de endereço** (`src/agent/address.ts`, §D2) — pronto e testado,
   ainda não ligado à conversa. Ver "o que falta para fechar a A3".
4. **Contrato de checkout da Coinzz** (`src/order/checkout.ts`, §E1/§E2) —
   formato escrito, mock no lugar da credencial, idempotência testada.

100 testes e o typecheck passam. O que resta de bloqueante não é código: é o
número de WhatsApp.

### Merges recentes no `main`

| PR | O que entrou |
|---|---|
| [#8](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/8) | Núcleo do agente: guardrails, máquina de estados, seam de custo de modelo, handler de turno, réguas de follow-up. Teve conflito de merge contra o `main` (que havia reorganizado `docs/` nos PRs #6/#7) — resolvido, caminhos atualizados sem alterar conteúdo. **Mergeado.** |
| #6/#7 | Reorganização de `docs/` em três compartimentos (`documentacao/`, `agente-ia/`, `campanhas-e-anuncios/`) + pesquisa de Meta Ads Conversions API |
| [#4](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/4) | Quatro rodadas de decisão com o operador + o plano de construção ponta a ponta |
| [#3](https://github.com/rodrigovaroto-wq/Ricos-com-AI/pull/3) | Contexto inicial: produto, oferta, economia do COD, pesquisa em 8 repositórios open source, especificação funcional, guardrails |

Sem CI configurado neste repositório (`.github/workflows/` não existe),
então "verde" aqui significa `tsc --noEmit` e `vitest run` locais.

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
| Schema do banco | `supabase/migrations/0001_init.sql`, `0002_retention_cron.sql` | ✅ Aplicado no projeto `Ricos com AI` (Supabase) |
| Handler do turno (o cérebro) | `supabase/functions/turn/index.ts` | ✅ **Deployado** como Edge Function `turn` (versão 8), testado ponta a ponta com conversas reais |
| Fluxo de entrada | n8n, workflow `Encorpa — Turno da agente` (`HnGrxquQLpfbXWLH`) | ✅ Publicado, webhook `POST /encorpa-inbound` |
| Cron da régua | n8n, workflow `Encorpa — Relógio da régua` (`SVDtFUi2N9oOskkx`) | ✅ Publicado, varre a cada 5 min |
| Retenção de 90 dias | `pg_cron` dentro do próprio banco | ✅ Todo dia às 04:00, roda mesmo se o n8n cair |

**Cópias que precisam ficar idênticas.** A Supabase sobe conteúdo de arquivo,
não resolve o repositório — então `guardrails.ts`, `followups.ts` e agora
`sizing.ts` existem duas vezes (uma vez para teste local, uma vez para a Edge
Function). O teste `tests/function-drift.test.ts` falha se as duas cópias de
qualquer um dos três divergirem — sempre editar os dois lados juntos.

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
3. **Destino da notificação de handoff** (perguntas 7 e 16 do plano). A decisão
   é "por e-mail enquanto não há WhatsApp", mas o endereço nunca foi dado —
   hoje `handoff_at` é gravado e ninguém é avisado.

---

## O que fazer em seguida

Em ordem:

1. **Comprar o chip do WhatsApp e começar a usá-lo como número comum.** Única coisa com
   prazo de calendário: número novo precisa de semanas de uso normal antes de tráfego pago.
   Não bloqueia a fase A, mas atrasa a fase B se ficar para depois.
2. **Alinhar o FAQ do site ao prazo real** (3 a 5 dias) — divergência aberta hoje.
3. Continuar a onda A3 (extração de endereço, checkout pré-preenchido da Coinzz — falta
   credencial) e seguir para A4 (Hermes, conversão de volta para o Meta).
4. **Rotacionar as credenciais** coladas em texto puro durante o desenvolvimento das
   sessões anteriores (service_role key da Supabase, chaves OpenAI/Gemini) — ficaram em
   histórico de chat, o que é motivo suficiente para trocar antes do lançamento.
5. Acompanhar o `HANDOFF.md` do **Encorpa-Website** para mudanças no site que afetem o
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
