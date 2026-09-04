# A economia do pagamento na entrega

Fonte: `colet-cinta-modeladora/docs/contexto-do-projeto.md` §1.

**Este arquivo é o mais importante do diretório.** Toda decisão sobre o agente — custo
por conversa, quando escalar para humano, quanto insistir num follow-up — se mede aqui.

Este arquivo traz a **unidade econômica medida da operação**. A projeção de volume, CPL e
metas do canal está em [`06-modelo-economico.md`](06-modelo-economico.md).

## Unidade econômica

| Evento | Resultado |
|---|---|
| Entrega concluída e paga | **+ R$ 63,35** |
| Entrega recusada, com `Físico na entrega` ativo (o entregador cobra) | **− R$ 14,98** |
| Entrega recusada, pós-pago (entrega-depois-cobra) | **− R$ 54,98** |

A diferença entre as duas formas de recusa é de **3,7×**. É a alavanca mais importante
da operação inteira e **não tem nada a ver com o site nem com o agente** — depende de o
operador ativar `Físico na entrega` na Coinzz.

**Ponto de equilíbrio:** acima de **16,5%** de inadimplência, um CPA de R$ 35 perde
dinheiro.

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
