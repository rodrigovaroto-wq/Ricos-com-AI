# Frente 4 item 6 — a economia citável, e a premissa que não se sustenta

> **Status: decisão tomada em 2026-09-10 (tarde), código ainda não escrito.** O operador
> respondeu a pergunta que §Recomendação deixou em aberto: **sim, o frete do antecipado
> vai ser parametrizado na Coinzz, inteiramente pago pela cliente, custo zero para a
> operação.** Palavras do operador: "a diferença entre pagamento na entrega e pagamento
> antecipado é só o tempo de recebimento e a taxa de frustração, os demais custos são
> exatamente iguais." Isso resolve a pergunta em aberto e aponta a **saída C** como a
> escolhida — mas o trabalho de código que a saída C exige no gate `price_promise` (exigir
> a ressalva de frete junto do número de economia) **não foi feito nesta sessão**: a
> sessão foi redirecionada para a Frente 5 antes de chegar aqui. Fica para a próxima.

## A pergunta original

Com `prepayBrl = 116,91` (desconto de 10% sobre os R$ 129,90 publicados), o gate
`price_promise` passa a admitir a diferença `codBrl − prepayBrl = R$ 12,99` como número
citável. A agente fica autorizada a dizer **"você economiza R$ 12,99 no antecipado"**.

O `HANDOFF.md` levantou isso como meia-verdade, com esta premissa:

> "Se o frete real cobrado no checkout for maior que R$ 12,99 (**o que é o caso normal
> — R$ 15 a R$ 40 conforme a região, pela própria tabela da Logzz documentada neste
> arquivo**), a cliente paga mais no antecipado apesar de ouvir que está economizando."

## A premissa está errada, e o próprio handoff tem o dado que a derruba

Os R$ 15 a R$ 40 **não são o que o checkout cobra da cliente**. São custo do operador.
Duas medições, ambas feitas na fonte e registradas no mesmo arquivo:

| Número | O que é de verdade | Onde foi medido |
|---|---|---|
| **R$ 24,98** | `deliveryPrice` do `stock-and-delivery-day` — frete do **COD**, constante nos 16 CEPs testados. Depois **zerado pelo operador** na oferta (`freight: "0.00"`) | §"O frete do pagamento na entrega é constante" |
| **R$ 15,00** | `LABEL_COST_BRL` — a etiqueta que **o operador** paga à Logzz | `src/agent/availability.ts` |
| **R$ 17,78 a R$ 84,05** | `local_operation`, de São Paulo a Altamira — **custo do operador, não preço da cliente**, dito com essas palavras no handoff | §"O frete do pagamento na entrega é constante" |
| **R$ 0,00** | O que o checkout do **antecipado** cobra dela hoje: `POST /checkout/entrega/getAll` com `urlOffer=encorpa-pagamento-antecipado-0` devolve **sem frete configurado nos 27 estados**, e `settingsFreight` daquela oferta vem `[]` | idem, "confirmado na fonte" |

**Consequência direta:** hoje, do jeito que as duas ofertas estão parametrizadas, a
cliente que escolhe o antecipado paga **R$ 116,91 e mais nada**, em qualquer lugar do
Brasil. A economia de R$ 12,99 é **verdade literal**, não meia-verdade. A armadilha
descrita no item 6 **não existe ainda**.

## Ela passa a existir no dia em que uma coisa mudar — e essa coisa é do operador

A decisão 2 de 2026-09-10 diz que "o frete do antecipado passa a ser da cliente,
calculado no checkout". Isso **não é uma mudança de código**: é parametrizar frete na
oferta `encorpa-pagamento-antecipado-0` dentro da Coinzz. Enquanto `settingsFreight`
daquela oferta for `[]`, o checkout cobra zero, não importa o que o config do agente
diga.

E aí está o problema real de subir a Frente 4 hoje: `freeShipping: false` faz a agente
**parar de dizer "frete grátis"** — que é o melhor argumento dela e é verdade — e passar
a dizer que o frete "é calculado no checkout", que é **falso** enquanto a oferta não
tiver frete. Meia-verdade na direção oposta: a cliente ouve que vai pagar frete e não
paga. Menos danoso que o contrário, e ainda assim é a agente descrevendo um mundo que
não existe.

## Análise de sensibilidade — o que a cliente paga no antecipado

`prepayBrl = 116,91`. O que ela paga no total, por frete cobrado no checkout, contra os
R$ 129,90 do COD:

| Frete cobrado dela | Total antecipado | vs. COD (R$ 129,90) | A frase "economiza R$ 12,99" é |
|---|---|---|---|
| **R$ 0,00** *(o de hoje)* | R$ 116,91 | **−R$ 12,99** | verdadeira |
| R$ 9,90 | R$ 126,81 | −R$ 3,09 | verdadeira no número, enganosa no total |
| **R$ 12,99** | R$ 129,90 | R$ 0,00 | falsa: ela não economiza nada |
| R$ 17,78 *(SP)* | R$ 134,69 | **+R$ 4,79** | falsa: ela paga mais |
| R$ 24,98 *(o frete do COD)* | R$ 141,89 | **+R$ 11,99** | falsa: ela paga mais |
| R$ 84,05 *(Altamira)* | R$ 200,96 | **+R$ 71,06** | falsa e absurda |

**O ponto de virada é R$ 12,99.** Qualquer frete acima disso e a frase deixa de ser
verdadeira — e a maior parte da tabela de custo real do operador está acima.

## O outro lado: a margem, que ninguém pediu para olhar mas piora

O raciocínio que zerou o desconto em 09-09 continua de pé: ao mesmo preço, o antecipado
rendia **R$ 48,35** contra **R$ 63,35** do COD, porque o antecipado paga frete que o COD
não paga. Cortar R$ 12,99 do antecipado sem repassar frete a ela leva o rendimento para
perto de **R$ 35,36** — e em praça distante o `local_operation` de R$ 84,05 come mais da
metade da venda, como o handoff já registrou.

Ou seja: **as duas metades da decisão de 2026-09-10 se sustentam mutuamente.** O
desconto de 10% foi decidido *porque* a cliente passaria a pagar frete. Subir o desconto
sem subir o frete é a pior das quatro combinações possíveis:

| | Cliente paga frete | Cliente não paga frete |
|---|---|---|
| **Desconto 10%** | consistente — e o item 6 vira problema real | **margem pior de todas** (o estado que a Frente 4 sozinha cria) |
| **Desconto 0%** | melhor margem, pior conversão | o estado de hoje (v30) |

## As três saídas do item 6, reavaliadas

- **A — tirar a economia em reais do conjunto citável** (fica só os 10%). Custo: perde o
  argumento mais concreto, **e hoje perde um argumento que é verdadeiro**. Ganho: fica à
  prova do dia em que o frete for parametrizado, sem precisar de deploy naquele dia.
- **B — manter a citação.** Hoje é honesto. Vira meia-verdade automaticamente, e em
  silêncio, no minuto em que o operador configurar frete na Coinzz. É opção comercial, e
  só o operador pode escolhê-la.
- **C — citar a economia sempre colada à ressalva** ("mais frete, calculado no
  checkout"). Fiel nos dois mundos, e o mais difícil de fazer o gate aceitar sem soar
  burocrático. **E hoje diz uma ressalva falsa.**

## Recomendação

> **Decidido em 2026-09-10 (tarde): o caminho é o item 2 abaixo, saída C.** O texto
> original desta seção fica como registro do raciocínio que levou lá — a decisão não
> inventou a resposta, escolheu entre as que já estavam aqui.

1. ~~**O operador decide se vai parametrizar frete na oferta do antecipado na Coinzz.**~~
   **Decidido: sim.** Frete inteiramente da cliente, calculado por região no checkout,
   custo zero para a operação.
2. **Saída C, ainda não implementada.** O gate `price_promise` precisa aprender a exigir
   a ressalva de frete junto do número de economia — hoje ele admite "você economiza
   R$ 12,99" sem exigir nenhuma menção a frete. Trabalho de código, não de config:
   próxima tarefa desta frente, depois da Frente 5.
3. ~~**Se não:** a Frente 4 fica incompleta de propósito...~~ Não se aplica — a decisão
   foi "sim".

**O que não fazer em nenhum dos dois casos:** subir `freeShipping: false` antes de
existir frete configurado na Coinzz. É a única combinação que faz a agente mentir hoje,
e ela mente para pior — cobra frete que a operação não cobra, empurrando a cliente para
o COD por um motivo inventado.

## Como o código está preparado

Nada aqui exige lógica nova, e é bom que seja assim:

- `src/order/checkout.ts` — `CheckoutPrices.prepayBrl` é "produto só, frete calculado à
  parte no checkout" desde que foi escrito.
- `guardrails.ts` → gate `shipping_promise` tem as duas branches prontas e testadas, e
  uma flag (`delivery.freeShipping`) decide qual vale.
- `guardrails.ts` → gate `price_promise` lê `prepayBrl` e `prepayDiscountPercent` direto
  do config, e admite a economia **só enquanto ela é positiva** — com desconto zero a
  diferença é R$ 0,00 e o gate já a exclui de propósito, para não licenciar "sai por zero
  reais".

O que falta é valor certo entrando — e a decisão de qual é o certo.
