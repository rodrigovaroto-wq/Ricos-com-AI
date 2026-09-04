# Guardrails — o que o sistema garante, não o que o prompt pede

## O princípio

Roubado inteiro de DeskcommCRM → `lib/agent-engine/playbooks/platform.md`, cabeçalho:

> Regras duras (janela de envio, STOP, throttle, validação de promessa) **não vivem no
> texto de instrução**: são hooks determinísticos com poder de veto — o texto apenas
> orienta o tom, nunca o substitui.

Essa fronteira é o que separa "pedimos ao modelo para não fazer" de "o sistema não deixa".
No nosso caso ela não é teórica: a operação **já quebrou uma promessa em produção** — o
site prometia pagar na entrega enquanto o checkout emitia PIX imediato, e isso explica 2
de 3 PIX expirados e aprovação em 33%. Um prompt não teria impedido; um gate impediria.

## A cadeia, em ordem

Referência de forma: DeskcommCRM → `guardrails/before-send.ts` :660
(`BEFORE_SEND_CHAIN_VERSION`), :681–693 (`BEFORE_SEND_GATES`), com 11 portões. A ordem
deles é **constante de código, versionada, com teste que trava ordem e tamanho** — porque
"stop primeiro" é invariante de segurança, não configuração.

Proposta para o nosso caso, do mais irrevogável ao mais cosmético:

| # | Gate | Veta quando | Origem da regra |
|---|---|---|---|
| 1 | **stop / opt-out** | a cliente pediu para parar | Irrevogável. Ver seção abaixo |
| 2 | **promessa de cobrança** | a mensagem afirma que não haverá cobrança antes da entrega **e** `Físico na entrega` não está ativo | [`../00-contexto/05-decisoes-firmes.md`](../00-contexto/05-decisoes-firmes.md) §2 |
| 3 | **promessa de preço e desconto** | valor divergente de R$ 129,90, ou desconto de 5% com `PREPAY_DISCOUNT.enabled = false` | `colet/src/lib/checkout.ts` :42–49 |
| 4 | **claim de emagrecimento** | a mensagem sugere que o produto emagrece ou que o efeito é permanente | `FAQ.tsx` :26; decisão firme §3 |
| 5 | **pacing / anti-banimento** | fora da janela de horário, acima do throttle, acima do teto diário, ou número ainda em aquecimento | DeskcommCRM → `pacing/engine.ts` :56, :120, :201 |
| 6 | **anti-template-idêntico** | a mesma mensagem literal saindo em massa | DeskcommCRM → `spinning/engine.ts` :2–4 |
| 7 | **prazo e logística** | promete data de entrega mais firme do que "7 a 14 dias, agendada" | `FAQ.tsx` :21 |
| 8 | **depoimento inventado** | atribui um depoimento que não está na base | Decisão firme §7 |
| 9 | **disclosure** | primeira mensagem da conversa sem se identificar como assistente | Ver conflito abaixo |

Cada gate avaliado vira **linha de trace** com veredito e código, persistida. Quando um
gate veta, a razão volta **ao modelo** como erro instrutivo em pt-BR — ele vê no turno
seguinte e corrige, em vez de o turno morrer.

## Opt-out: dois níveis, e a diferença importa

Referência: DeskcommCRM → `lib/opt-out/deteccao.ts`, `ehPedidoDeOptOut` :319,
`ehOptOutProvavel` :332.

O arquivo documenta o estrago da regex ingênua numa instalação real:

| Mensagem | Regex ingênua | Correto |
|---|---|---|
| "tem como parar a dor?" | bloqueou a paciente | não é opt-out |
| "posso sair antes das 15h?" | bloqueou a paciente | não é opt-out |
| "não quero mais receber nada" | **não** bloqueava | é opt-out |

A regra: verbo de cessação **mais objeto de comunicação** ("parar de me mandar", "sair da
lista"), ou a palavra **isolada** como mensagem inteira.

**Para nós isso é ainda mais sensível:** "para" e "sai" são vocabulário normal de uma
venda — *"para qual tamanho?"*, *"sai quanto?"*, *"quero sair mais cedo"*.

Dois níveis:
- **Inequívoco** → grava bloqueio permanente. Só uma pessoa desfaz.
- **Ambíguo** ("me deixa em paz", "chega") → **para de responder e escala ao humano**. Quem
  silencia alguém para sempre deveria ser gente.

## O conflito do disclosure

A LP promete, em `Objection.tsx` :13:

> **WhatsApp com gente de verdade** — Não é robô. Se der qualquer problema, tem alguém do
> outro lado.

E a boa prática (e a lei, em várias leituras) pede que o assistente se identifique como
assistente. **As duas coisas não cabem juntas sem uma escolha do operador.** Está
registrado como decisão em aberto — ver
[`../04-decisoes/02-decisoes-em-aberto.md`](../04-decisoes/02-decisoes-em-aberto.md).

Enquanto não houver decisão, o caminho conservador é: o agente se identifica como
assistente **e** garante que existe humano alcançável — o que torna o handoff requisito, e
não recurso.

## Teto de custo como guardrail

Com R$ 63,35 de margem por entrega paga, uma conversa que foge do controle come o lucro.
Referência: DeskcommCRM → `inbound-turn.ts` :432 — ao estourar o teto, a conversa **vira
handoff humano**, não degrada em silêncio nem continua gastando.
