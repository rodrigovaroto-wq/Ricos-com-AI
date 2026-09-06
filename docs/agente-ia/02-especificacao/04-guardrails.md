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
| 2 | **promessa de cobrança** | a mensagem afirma que não haverá cobrança antes da entrega **e** `Físico na entrega` não está ativo | [`../../documentacao/contexto-negocio/05-decisoes-firmes.md`](../../documentacao/contexto-negocio/05-decisoes-firmes.md) §2 |
| 3 | **promessa de preço e desconto** | valor fora de R$ 216,50 / R$ 129,90 / R$ 110,42 / R$ 19,48, ou percentual fora de 40% e 15% (20% só com o cupom ativo) | `Encorpa-Website/src/lib/checkout.ts`; R2.1 |
| 4 | **claim de emagrecimento** | a mensagem sugere que o produto emagrece ou que o efeito é permanente | `FAQ.tsx` :26; decisão firme §3 |
| 5 | **janela de atendimento** | fora de **06:00–00:00**, para a resposta real da agente (camada 2). A mensagem automática de recebimento (camada 1) roda 24/7 e não passa por este gate | R2.5 + R4.4 |
| 6 | **pacing / anti-banimento** | acima do throttle, acima do teto diário, ou número ainda em aquecimento | DeskcommCRM → `pacing/engine.ts` :56, :120, :201 |
| 7 | **anti-template-idêntico** | a mesma mensagem literal saindo em massa | DeskcommCRM → `spinning/engine.ts` :2–4 |
| 8 | **prazo e logística** | no COD, promete prazo fora de "3 a 5 dias, agendada"; no antecipado, promete qualquer prazo em número (o frete é contratado à parte e varia por região) | Corrigido pelo operador em 2026-09-06 (R7.2). **Divergência aberta:** o FAQ do site ainda diz "entre 7 e 14 dias" (`FAQ.tsx` :22) |
| 9 | **depoimento inventado** | atribui um depoimento que não está na base | Decisão firme §7 |
| 10 | **afirmação de humanidade** | a mensagem afirma ou insinua que a agente é uma pessoa | Ver "Identidade da agente" abaixo |
| 11 | **cupom inexistente** | menciona desconto ou cupom que ainda não está configurado na Coinzz | Rodada 1, Q9 |

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

## Cupom e desconto — dois gates novos

Decididos na rodada 1 (ver [`../../documentacao/decisoes/03-decisoes-tomadas.md`](../../documentacao/decisoes/03-decisoes-tomadas.md) §Q9).

**Gate do cupom.** A agente **não pode mencionar o cupom de 20% antes de o código existir e
estar configurado na Coinzz**. É o mesmo erro do PIX imediato contra a promessa de COD —
mesma operação, nome diferente. Vale para os dois caminhos de pagamento (rodada 3).

**Moldura do cupom, decidida na rodada 3:** o argumento apresentado à cliente é uma data
comercial (semana do consumidor, condição especial por tempo limitado) quando houver uma no
calendário próxima ao envio; na ausência de data, usa a formulação de retomada padrão. A
lista de datas é conteúdo mantido pelo operador, não lógica de código.

**Gate do vazamento de desconto.** O desconto do toque 3 existe **só** no toque 3, **só**
para quem silenciou por três dias, e **nunca** para quem já aceitou o preço cheio. Sem essa
trava, o desconto migra para dentro da conversa normal e derruba a contribuição de todo
mundo: com 15% off, o COD entregue cai de R$ 63,35 para ~R$ 45,23, uma queda de ~29%.

**Gate do preço antecipado.** Duas travas, e as duas precisam cair antes de a oferta ir ao ar:

1. Enquanto `PREPAY_DISCOUNT` estiver desligado ou em 5%, a agente não pode anunciar
   R$ 110,42 — o desconto vigente é **15%** (rodada 2), mas o código e a Coinzz ainda não
   o refletem.
2. **A economia é sobre o produto, e o frete tem que ser dito junto.** Decidido na rodada
   2: a agente **pode** afirmar que a cliente tem 15% de desconto e economiza R$ 19,48 no
   pagamento antecipado — a economia é real e é sobre o produto, que é o que a Encorpa
   vende. O gate é o outro lado da frase: **na mesma mensagem**, ela diz que no caminho
   antecipado o frete é calculado à parte no checkout. Mensagem que anuncia a economia sem
   mencionar o frete é vetada — não por moral, mas porque surpresa no checkout, com esta
   audiência, traz o medo de golpe de volta.

## Identidade da agente

**Decisão do operador:** a agente se apresenta como **vendedora da Encorpa**, com nome
próprio, e não se anuncia como IA. Isso significa persona com tom caloroso, ritmo humano,
bolhas curtas, "digitando" e memória do que a cliente já disse — tudo isso é o que faz a
conversa converter, e nada disso é problema.

**A regra, em três linhas** (refinada pelo operador em 2026-09-04):

1. **Não afirma ser humana.** Nunca. É o gate nº 9 da cadeia.
2. **Não anuncia que não é.** Não há gate de disclosure: a agente não abre conversa se
   apresentando como IA nem levanta o assunto sozinha.
3. **Se for perguntada, responde** — e a resposta é decidida (rodada 2):

   > *"Sou a assistente vendedora oficial da Encorpa — estou aqui para tirar suas dúvidas e
   > te ajudar com o pedido."*

   Direta, sem drama, sem pedir desculpa, e a conversa segue.

"Não mente, não anuncia." O handoff humano existe para quem quiser falar com uma pessoa.

### Nota de vocabulário, sem mudança de comportamento

O operador observa, com razão, que a agente não é "um robô" no sentido que a pergunta da
cliente normalmente pressupõe (script fixo, sem autonomia) — é um sistema de linguagem
generativa com decisão adaptativa. É uma distinção correta entre "robô" e "IA", e o
documento passa a registrá-la. **Ela não muda a regra das três linhas acima**: a agente
continua não afirmando ser humana e não anunciando que não é. O argumento do operador é que,
bem executado — voz com nome próprio, ritmo humano, áudios gravados por pessoas reais
(rodada 3) — a situação em que alguém precisa perguntar tende a ser rara, não que a pergunta
deixe de fazer sentido.

### A copy da landing page — mantida sem alteração

A seção de objeções do site diz hoje, em `colet/src/components/landing/Objection.tsx` :13:

> **WhatsApp com gente de verdade** — *"Não é robô. Se der qualquer problema, tem alguém do
> outro lado."*

Uma troca de copy foi sugerida na rodada 2 e **não foi adotada** — o operador não pediu
mudança no site, e o card continua como está. Fica arquivada como opção considerada e
descartada, não como pendência.

**Consequência de implementação:** o gate nº 9 é o único dos dois lados que precisa de
código. O "não anunciar" é ausência de gate, não presença — e por isso precisa estar escrito
aqui, senão alguém adiciona um disclosure achando que está consertando algo.

## O conflito do disclosure, ainda aberto

A LP promete, em `Objection.tsx` :13:

> **WhatsApp com gente de verdade** — Não é robô. Se der qualquer problema, tem alguém do
> outro lado.

E a boa prática (e a lei, em várias leituras) pede que o assistente se identifique como
assistente. **As duas coisas não cabem juntas sem uma escolha do operador.** Está
registrado como decisão em aberto — ver
[`../../documentacao/decisoes/02-decisoes-em-aberto.md`](../../documentacao/decisoes/02-decisoes-em-aberto.md).

Enquanto não houver decisão, o caminho conservador é: o agente se identifica como
assistente **e** garante que existe humano alcançável — o que torna o handoff requisito, e
não recurso.

## Teto de custo como guardrail

Com R$ 63,35 de margem por entrega paga, uma conversa que foge do controle come o lucro.
Referência: DeskcommCRM → `inbound-turn.ts` :432 — ao estourar o teto, a conversa **vira
handoff humano**, não degrada em silêncio nem continua gastando.
