---
name: logzz-e-coinzz-catalogos-separados
description: O colete tem dois cadastros com códigos e estoques diferentes (Coinzz 79880/pro7ml00…, Logzz prow6pq0/projm2ov…); código de um nunca vale no outro, e a cobertura de pagamento na entrega difere por cidade e tamanho.
metadata:
  type: business-rule
---

Em 28/10 uma comparação "a Logzz entrega G em SP" saiu errada porque usei os códigos de tamanho da Coinzz (`pro7ml00`…) na API da
Logzz: são outro produto. A Logzz é o produto `prow6pq0` (id 165378) com variações `progm9w6` P, `pro37j6q` M, `projm2ov` G,
`prolm313` GG, `prox1jxp` XG (= XGG); as ofertas são `sal0g3mo`/`salng30n`/`sal6gz39`. Na API oficial de datas
(`POST app.logzz.com.br/api/delivery-day/options/zip-code/{cep}`, sem token, `products:[{code, variants:[{code,quantity}]}]`) a
Logzz entrega G em SP e M em BH; o checkout da Coinzz não, e o M dá 404 na Coinzz em todo lugar. Tabela por cidade em
`docs/operacao/estoque-logzz-x-coinzz-2026-10-28.json`. Antes de afirmar cobertura, use o código da plataforma que vai vender.

Sonda segura do import da Logzz: POST para um CEP sem entrega (Manaus 69005000) para ver só a validação da oferta e da variação
("A oferta cadastrada é inválida", "A variação do pedido é diferente do produto", "Data de entrega indisponível") — **nunca cria
pedido**. Um POST com CEP atendido e data válida cria pedido real (R$ 9,99 de recusa na porta se errado).
