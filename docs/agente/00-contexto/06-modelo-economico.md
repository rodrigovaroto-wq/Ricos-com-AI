# Modelo econômico — site vs. WhatsApp + IA

Fonte: documento *"Modelagem Econômica — Site vs. WhatsApp + IA (versão atualizada)"*,
entregue pelo operador em 2026-09-03.

> **Como tratar este arquivo.** É um **estudo de projeção com dados de mercado**, não
> resultado medido da nossa operação. O próprio documento encerra dizendo que *"a decisão
> final deve ser confirmada por teste real de CPL/CPC, conversão e CAC"*. Serve para
> dimensionar o agente e priorizar trabalho — não como verdade.
>
> **Os cenários sem COD não são premissa nossa.** A operação é COD. Eles ficam registrados
> só como referencial comparativo do estudo.

## Premissas gerais

| Item | Premissa |
|---|---|
| Mídia | R$ 300/dia |
| Preço COD | R$ 129,90 |
| Preço antecipado/Pix | R$ 116,90 (**10% de desconto**) |
| Custo do produto | R$ 30,00 |
| Mix | 70% COD / 30% antecipado |
| Recusa COD | 15% |
| Agente de IA | **R$ 0,80 por lead** |
| Upsell / order bump | não considerado |
| Mercado | Brasil, 1 unidade por pedido |

## Contribuição por pedido, antes da mídia

| Tipo | Custos considerados | Contribuição |
|---|---|---|
| COD entregue | produto + transação 6,99% + R$ 2,49 + handling R$ 4,99 + entrega R$ 19,99 | **R$ 63,35** |
| COD recusado | produto + transação + handling R$ 4,99 + falha R$ 9,99 | **− R$ 14,98** |
| Antecipado/Pix | sem handling e sem falha COD | **R$ 68,34** |

Média COD com 15% de recusa: **R$ 51,60**. Com o mix 70/30, o estudo usa **R$ 56,62 por
pedido** — número que a correção abaixo revisa para **R$ 58,99**.

### Correção do operador (2026-09-04)

O valor do antecipado no estudo, R$ 68,34, **não fecha** com os componentes da própria
tabela. A conta correta, confirmada pelo operador, é:

```
116,90 (preço antecipado)
− 30,00 (produto)
− 10,66 (transação: 6,99% de 116,90 = 8,17 + 2,49)
= 76,24
```

**Contribuição do antecipado: R$ 76,24.** A do COD entregue permanece **R$ 63,35**.

Isso muda os números derivados:

| | Estudo | Corrigido |
|---|---|---|
| Contribuição antecipado | R$ 68,34 | **R$ 76,24** |
| Média COD (15% recusa) | R$ 51,60 | R$ 51,60 (não muda) |
| **Média com mix 70/30** | R$ 56,62 | **R$ 58,99** |

E, com ela, os cenários:

| Cenário | Lucro/dia (estudo) | Lucro/dia (corrigido) | 30 dias (corrigido) |
|---|---|---|---|
| Otimista | R$ 2.007,90 | **R$ 2.114,55** | R$ 63.436,50 |
| Base | R$ 1.206,60 | **R$ 1.277,70** | R$ 38.331,00 |
| Pessimista | R$ 672,40 | **R$ 719,80** | R$ 21.594,00 |

> ⚠️ **Uma dúvida que continua aberta, e que é material.** Não está claro se a contribuição
> do antecipado desconta o **frete de R$ 19,99** que aparece no COD entregue. O produto é
> enviado de qualquer forma. Se o frete também incidir no antecipado, a contribuição cai
> para **R$ 56,25** — e aí o antecipado passa a valer *menos* que o COD entregue, o que
> inverteria a lógica de oferecer desconto para antecipar. O estudo lista uma premissa de
> "logística adicional sem COD: R$ 5,00", o que sugere estrutura de frete diferente, mas
> não fecha em nenhuma combinação testada. **Confirmar antes de calibrar a oferta de
> antecipado.**

## WhatsApp + COD — os três cenários

| Cenário | CPL | Conv. | Leads/dia | Vendas/dia | IA/dia | CAC | Lucro/dia | 30 dias |
|---|---|---|---|---|---|---|---|---|
| Otimista | R$ 1,00 | 15,0% | 300 | 45 | R$ 240 | R$ 12,00 | R$ 2.007,90 | R$ 60.237,00 |
| Base | R$ 1,25 | 12,5% | 240 | 30 | R$ 192 | R$ 16,40 | R$ 1.206,60 | R$ 36.198,00 |
| Pessimista | R$ 1,50 | 10,0% | 200 | 20 | R$ 160 | R$ 23,00 | R$ 672,40 | R$ 20.172,00 |

Para comparação, o **Site + COD** no cenário base (CPC R$ 0,75, conversão 2,8%) dá
R$ 322,82/dia — **R$ 9.684,60 em 30 dias**. O WhatsApp base é ~3,7× isso.

Fórmulas do estudo: `leads = 300 ÷ CPL` · `vendas = leads × conversão` ·
`custo de IA = leads × 0,80` · `CAC = (mídia + IA) ÷ vendas` ·
`lucro = vendas × contribuição − mídia − IA`.

## O que isso impõe ao agente

### 1. A meta de 10% é o piso, não o teto

10% é o **cenário pessimista** do estudo. Mesmo lá, o WhatsApp entrega R$ 20.172/30d
contra R$ 9.684 do site no cenário base. A meta declarada do operador é atingir 10% de
conversão de conversa para pedido criado — é o mínimo para o canal se justificar, não uma
ambição.

### 2. O ponto de morte fica em ~3,6% de conversão

Com CPL de R$ 1,25, o custo diário é R$ 300 de mídia + R$ 192 de IA = R$ 492. Dividido
pela contribuição corrigida de R$ 58,99, são **8,34 vendas/dia**, ou **3,47% de conversão**.

| CPL | Leads | Custo total/dia | Equilíbrio (R$ 56,62) | Equilíbrio (R$ 58,99) |
|---|---|---|---|---|
| R$ 1,00 | 300 | R$ 540 | 3,18% | 3,05% |
| R$ 1,25 | 240 | R$ 492 | 3,62% | 3,47% |
| R$ 1,50 | 200 | R$ 460 | 4,06% | 3,90% |

Entre 3,6% e 10% é a faixa onde o agente precisa viver. Abaixo, ele custa dinheiro.

### 3. O agente é a segunda maior linha de custo, e ela é por lead

No cenário base: **R$ 192/dia de IA para R$ 300 de mídia** — 64% do valor da mídia, 39%
do custo total.

E o detalhe que decide a arquitetura: **dos R$ 192, cerca de R$ 168 são gastos com os 210
leads que não compram** (87,5% do custo de IA). Por venda fechada, a IA custa R$ 6,40 —
10,8% da contribuição de R$ 58,99.

**Consequência de projeto, não de otimização:** caminho barato primeiro (opt-out,
saudação e pedido de humano resolvidos por regra determinística, sem chamar modelo),
classificação com modelo barato, redação com modelo bom, e prefixo de prompt estável e
cacheável. Ver [`../02-especificacao/01-mapa-funcional.md`](../02-especificacao/01-mapa-funcional.md) §H8.

### 4. Sensibilidade — o que mais dói

| Se mudar | Efeito no cenário base |
|---|---|
| Recusa 15% → 20% | contribuição cai ~R$ 2,74; lucro cai ~7% |
| `Físico na entrega` desligado (recusa a −R$ 54,98) | contribuição cai ~R$ 4,20; lucro cai ~10%. **Não é o caso: está ativo** |
| Custo de IA R$ 0,80 → R$ 1,50 | −R$ 168/dia direto no lucro |
| Conversão 12,5% → 10% | −6 vendas/dia = **−R$ 354/dia** |
| Mix antecipado 30% → 50% | +R$ 2,58 por pedido = **+R$ 77/dia**, e menos pedidos expostos à recusa |

**A conversão é o item mais sensível dos quatro.** Por isso o primeiro corte do agente
ataca a pré-venda, e não o pós-pedido — ver
[`../04-decisoes/03-decisoes-tomadas.md`](../04-decisoes/03-decisoes-tomadas.md) §Q5.

### 5. Conversão vale ~4× mais que redução de recusa, nestes volumes

| Melhoria | Ganho/dia |
|---|---|
| Conversão de 10% → 12,5% (240 leads) | +6 vendas × R$ 58,99 = **+R$ 354** |
| Recusa de 15% → 10% (30 pedidos) | +R$ 2,74 por pedido = **+R$ 82** |

Isso **não** diminui a função de confirmação pós-pedido: ela protege o que a pré-venda
ganha, e a recusa na porta continua sendo o evento mais caro por unidade. Mas, no volume
projetado, a ordem de ataque é conversão primeiro.

### 6. Cada pedido que migra de COD para antecipado vale ~R$ 12,89 a mais

Com a contribuição corrigida, o antecipado (R$ 76,24) rende **R$ 12,89 a mais** que o COD
entregue (R$ 63,35) — mesmo dando 10% de desconto no preço. E rende mais ainda na prática,
porque **não corre risco de recusa**: o COD só entrega R$ 63,35 em 85% das vezes, e nos
outros 15% tira R$ 14,98.

Comparando pedido a pedido, já com a recusa embutida: **R$ 51,60 (COD) contra R$ 76,24
(antecipado)** — uma diferença de R$ 24,64.

Isso sustenta a decisão da rodada 1 de oferecer o antecipado com desconto **antes** de a
cliente finalizar. Com a ressalva que não muda: a oferta vem **depois** de o COD já estar
fechado, nunca como condição — o "não paga nada agora" é o que dissolve o medo de golpe, e
esse medo é a objeção nº 1 do público. Ver
[`../04-decisoes/03-decisoes-tomadas.md`](../04-decisoes/03-decisoes-tomadas.md) §Q8.

**Sujeito à dúvida do frete registrada acima.** Se o antecipado também pagar os R$ 19,99 de
entrega, a contribuição cai para R$ 56,25 e essa seção se inverte.

## Confirmações do operador sobre as premissas

| # | Ponto | Resposta |
|---|---|---|
| D1 | `Físico na entrega` ativo na Coinzz? | **Sim, ativo.** A recusa custa −R$ 14,98, e o modelo está correto neste ponto |
| D2 | Desconto do pagamento antecipado | **10%** — R$ 116,90. O código (`checkout.ts` :42) ainda tem 5% e desligado; diverge e precisa ser corrigido quando o desconto for configurado |
| D3 | "Venda" no modelo é o quê? | **Pedido criado.** A meta de 10% é conversa → pedido criado, com os 15% de recusa aplicados depois |
| D4 | Contribuição do antecipado | **R$ 76,24**, não R$ 68,34 — confirmado pelo operador. A média com mix 70/30 sobe para R$ 58,99 |
