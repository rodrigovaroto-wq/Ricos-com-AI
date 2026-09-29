---
name: entrega-concluida-so-no-cod
description: A taxa de entrega concluída (R$ 19,99) só existe no COD; antecipado entregue custa só MP + R$ 4,99 (cliente paga o frete). Devolução pós-envio custa R$ 25,00 completos (manuseio incluso) nos dois caminhos e NÃO é a recusa (15%, R$ 9,90, só COD); a taxa de transação não volta no estorno.
metadata:
  type: business-rule
---

Confirmado pelo suporte Logzz/Coinzz em 29/09 (R15.4). Não some R$ 19,99 ao custo do
antecipado. A "entrega frustrada" (cliente recusa na porta, 15%) é só COD e custa R$ 9,90 no
total, não R$ 9,99. Devolução ou cancelamento depois de enviado (7,5%, premissa do operador) é
outro evento: **R$ 25,00 completos, manuseio incluso, nos dois caminhos**; a taxa de transação
**não volta** (no antecipado o Mercado Pago cobra mesmo assim; no COD não há pagamento). Taxas
por pedido, não por peça, também nos kits (confirmado). Conta e tabela em
`06-modelo-economico.md`, caixa de 29/09.
