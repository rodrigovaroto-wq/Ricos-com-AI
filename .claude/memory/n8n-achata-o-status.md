---
name: n8n-achata-o-status
description: O webhook do n8n devolve 200 com corpo vazio quando a Edge Function recusa — o status de erro do código nunca chega em quem chamou.
metadata:
  type: architecture
---

Sondado em 2026-09-09 contra o webhook de produção. A Edge Function passou a
recusar pedido sem `externalId` e pedido de telefone desconhecido com **422**, para
que o n8n não trate como sucesso uma venda que não foi gravada. Pela porta de
produção, as duas recusas voltaram **HTTP 200 com corpo vazio**.

O nó `Cerebro do turno` está com `neverError` desligado (correto — foi assim que a
porta fechada de 2026-09-08 ficou invisível por um dia). Um 4xx faz o nó lançar, a
execução falha, e o "Respond to Webhook" responde vazio com 200 mesmo assim.

Consequência: **o status HTTP não é canal de erro neste desenho.** A recusa aparece
no log de execução do n8n e em lugar nenhum além dele. Quem precisar reagir a uma
recusa tem que ler o corpo — ou o workflow precisa de um ramo de erro que avise.

Vale para qualquer rota nova atrás deste webhook, não só a de pedido.
