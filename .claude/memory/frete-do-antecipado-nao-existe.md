---
name: frete-do-antecipado-nao-existe
description: Os R$ 15 a R$ 84 de frete na documentação são custo do operador, não preço da cliente; o checkout do antecipado cobrava R$ 0,00 na última medição — mas desde 22/09 a agente não promete frete grátis e nunca cita a economia em reais (saída A).
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

**O que vale hoje (22/09):** a operação não oferece frete grátis — `freeShipping` só é
grátis com `=== true`, e a chave ausente lê como não grátis. E a economia do antecipado
**nunca** é citada em reais, só "10% de desconto" (saída A, §R10.6): com o frete variando
por região, "economiza R$ 12,99" seria meia-verdade, e o número não se protege por regex.

**Quando se aplica:** antes de mexer em `delivery.freeShipping`, `prices.prepayBrl`,
`shipping_promise` ou `price_promise`. Não use os R$ 15–84 como "o que a cliente paga", e
não reabra a citação da economia em reais sem motivo novo. Conta completa em
`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`.
