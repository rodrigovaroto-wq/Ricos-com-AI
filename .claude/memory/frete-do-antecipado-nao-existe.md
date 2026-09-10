---
name: frete-do-antecipado-nao-existe
description: A oferta do antecipado na Coinzz não tem frete configurado nos 27 estados — o checkout cobra R$ 0,00 dela, e os R$ 15 a R$ 84 documentados são custo do operador, não preço da cliente.
metadata:
  type: business-rule
---

`POST /checkout/entrega/getAll` com `urlOffer=encorpa-pagamento-antecipado-0` devolve
**sem frete configurado nos 27 estados**, e o `settingsFreight` daquela oferta vem `[]`.
Logo o checkout do antecipado cobra da cliente **R$ 0,00 de frete**, em qualquer CEP.

Os números de frete que aparecem espalhados na documentação **não são preço dela**:

- **R$ 24,98** — `deliveryPrice` do `stock-and-delivery-day`: frete do **COD**, constante,
  depois zerado pelo operador na oferta (`freight: "0.00"`).
- **R$ 15,00** — `LABEL_COST_BRL`: a etiqueta que **o operador** paga à Logzz.
- **R$ 17,78 a R$ 84,05** — `local_operation`, São Paulo a Altamira: **custo do
  operador**.

**Por que importa:** confundir os dois inverte a decisão. A Frente 4 quase subiu
`delivery.freeShipping: false` com o argumento de que a cliente "paga frete calculado no
checkout" — o que faria a agente **parar de dizer "frete grátis", que é verdade**, e
começar a dizer que ela paga frete, que é falso. E o mesmo erro fazia a economia de
R$ 12,99 do desconto de 10% parecer meia-verdade quando, com frete zero, ela é verdade
literal.

**Quando se aplica:** antes de mexer em `delivery.freeShipping`, em `prices.prepayBrl`,
no gate `shipping_promise` ou no `price_promise`. A pergunta a fazer primeiro é sempre:
*a oferta da Coinzz já tem frete parametrizado?* Se não tem, frete grátis no antecipado é
fato, não promessa. Conta completa em
`docs/documentacao/decisoes/04-frete-e-desconto-do-antecipado.md`.
