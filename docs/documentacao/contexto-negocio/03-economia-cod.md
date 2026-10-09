# A economia do pagamento na entrega

Fonte: `colet-cinta-modeladora/docs/contexto-do-projeto.md` §1.

**Este arquivo é o mais importante do diretório.** Toda decisão sobre o agente — custo
por conversa, quando escalar para humano, quanto insistir num follow-up — se mede aqui.

Este arquivo traz a **unidade econômica medida da operação**. A projeção de volume, CPL e
metas do canal está em [`06-modelo-economico.md`](06-modelo-economico.md).

> ### ⚠️ Atualização de 2026-10-09 — valores vigentes
>
> Manuseio **R$ 5,00**; recusa **R$ 9,99** (R$ 4,99 de entrega frustrada + R$ 5,00 de manuseio); devolução = frete de retorno
> (R$ 30–60) + manuseio + taxas já pagas que não voltam. A conta vigente está em
> [`docs/operacao/taxas-antecipadas-cod.md`](../../operacao/taxas-antecipadas-cod.md). Os valores abaixo são históricos.

> ### ⚠️ Atualização de 2026-09-29 — os números deste arquivo são históricos
>
> **Recusa: R$ 9,90** (R15.4, substitui os R$ 9,99 abaixo). **Checkout da entrega: Logzz**
> desde 25/09 (onde abaixo se lê "Coinzz", leia a plataforma da época). Entrega concluída
> (R$ 19,99) só existe no COD. A tabela vigente de lucro por venda, com 1, 2 e 3 peças, está em
> [`06-modelo-economico.md`](06-modelo-economico.md), caixa de 2026-09-29.

> ### ⚠️ Correção de 2026-09-21 — recusa com `Físico na entrega` ativo é R$ 9,99, não R$ 14,98
>
> Confirmado pelo operador (§R10.2 em
> [`../decisoes/03-decisoes-tomadas.md`](../decisoes/03-decisoes-tomadas.md)). O valor
> anterior, R$ 14,98, era a soma de handling (R$ 4,99) + falha COD (R$ 9,99) — o operador
> corrigiu para o total ser **R$ 9,99**. O multiplicador entre as duas formas de recusa
> abaixo foi recalculado; o valor pós-pago (R$ 54,98) não mudou. **Ainda pendente:**
> recalcular o ponto de equilíbrio de inadimplência (linha abaixo) — não há registro da
> fórmula original aqui para refazer a conta com segurança, e os R$ 63,35 de entrega paga
> também estão em revisão pelo operador (§R10.3), então este ponto de equilíbrio muda de
> novo assim que aquele número fechar.

## Unidade econômica

| Evento | Resultado |
|---|---|
| Entrega concluída e paga | **+ R$ 63,35** |
| Entrega recusada, com `Físico na entrega` ativo (o entregador cobra) | **− R$ 9,99** |
| Entrega recusada, pós-pago (entrega-depois-cobra) | **− R$ 54,98** |

A diferença entre as duas formas de recusa é de **~5,5×**. É a alavanca mais importante
da operação inteira e **não tem nada a ver com o site nem com o agente** — depende de o
operador ativar `Físico na entrega` na Coinzz.

**Ponto de equilíbrio:** acima de **16,5%** de inadimplência, um CPA de R$ 35 perde
dinheiro. **Pendente de recálculo** com o novo custo de recusa (R$ 9,99) — ver a correção
acima.

## O que isso impõe ao agente

1. **A recusa na porta é o evento mais caro**, e acontece *depois* de tudo parecer ter
   dado certo. A dúvida que vira recusa nasce nas primeiras horas após o pedido, quando
   o entusiasmo passa e sobra "será que isso é sério?".
2. **Custo de IA sai da margem.** Com R$ 63,35 por entrega paga, uma conversa que gasta
   R$ 3 em modelo já comeu quase 5% do lucro. Teto por conversa não é refinamento.
3. **Errar tamanho ou endereço é caro duas vezes** — frete perdido e produto perdido.
   Recomendação de tamanho não deveria ser improviso do modelo.
4. **Vale mais perder a venda do que criar um pedido que vai ser recusado.** Um "não"
   na conversa custa zero; um "não" na porta custa até R$ 54,98.

## Erro de medição já cometido, não repetir

O pixel contava **pedido criado** como venda. O CPA apareceu como R$ 47,19 quando o real
era **R$ 165,18**. Pedido criado ≠ pedido pago — e para o agente, conversa iniciada ≠
pedido ≠ entrega paga. Qualquer métrica do agente precisa dizer qual das três está
contando.
