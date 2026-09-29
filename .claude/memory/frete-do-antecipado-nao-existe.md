---
name: frete-do-antecipado-nao-existe
description: Os R$ 15 a R$ 84 de frete na documentação são custo do operador, não preço da cliente. Desde 28/09 (R15.3) o frete é grátis SÓ no pagamento na entrega (Logzz, R$ 0,00) e a agente diz isso nomeando o caminho; o antecipado (Coinzz) cobra por região e nunca é grátis; a economia em reais nunca é citada (saída A).
metadata:
  type: business-rule
---

`POST /checkout/entrega/getAll` com `urlOffer=encorpa-pagamento-antecipado-0` devolvia
**sem frete configurado nos 27 estados** (`settingsFreight: []`) — o checkout do
antecipado cobrava **R$ 0,00 de frete** na última medição. O operador decidiu (10/09)
parametrizar frete ali, pago pela cliente, data indefinida.

Os números de frete espalhados na documentação **não são preço dela**:

- **R$ 24,98** — `deliveryPrice` do `stock-and-delivery-day`: frete do **COD**, depois
  zerado pelo operador na oferta (`freight: "0.00"`).
- **R$ 15,00** — `LABEL_COST_BRL`: a etiqueta que **o operador** paga à Logzz.
- **R$ 17,78 a R$ 84,05** — `local_operation`, São Paulo a Altamira: **custo do operador**.

**O que vale hoje (28/09, R15.3):** no **pagamento na entrega o frete é grátis** — a oferta
da Logzz cobra R$ 0,00 dela — e a agente deve dizer isso, sempre com o caminho na mesma frase
("pagando na entrega o frete é grátis"). O **antecipado (Coinzz) cobra frete por região** no
checkout (confirmado pelo operador em 28/09 — a medição de `settingsFreight: []` acima ficou
velha) e nunca é grátis. No config: `delivery.codFreeShipping`, lido com `!== false` (ausente =
grátis na entrega, porque o secret não tem a chave); `freeShipping` continua sendo "grátis nos
DOIS caminhos", com `=== true`. De 22/09 a 28/09 valeu "não grátis em nenhum caminho", e o
gate vetava a frase verdadeira da entrega. E a economia do antecipado
**nunca** é citada em reais, só "10% de desconto" (saída A, §R10.6): com o frete variando
por região, "economiza R$ 12,99" seria meia-verdade, e o número não se protege por regex.

**Quando se aplica:** antes de mexer em `delivery.freeShipping`, `delivery.codFreeShipping`, `prices.prepayBrl`,
`shipping_promise` ou `price_promise`. Não use os R$ 15–84 como "o que a cliente paga", e
não reabra a citação da economia em reais sem motivo novo. Conta completa em
`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`.
