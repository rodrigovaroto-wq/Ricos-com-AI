---
name: n8n-achata-o-status
description: O webhook do n8n nunca devolve status de erro — a recusa da Edge Function viaja no CORPO (`status: "error"`) e num e-mail, nunca no código HTTP.
metadata:
  type: architecture
---

Sondado em 2026-09-09 contra o webhook de produção. A Edge Function recusa pedido sem
`externalId` e pedido de telefone desconhecido com **4xx**, para que o n8n não trate como
sucesso uma venda que não foi gravada. Pela porta de produção, as duas recusas voltavam
**HTTP 200 com corpo vazio**: o nó `Cerebro do turno` lançava, a execução falhava, e o
"Respond to Webhook" respondia vazio com 200 mesmo assim.

**Corrigido no mesmo dia.** O nó tem `onError: "continueErrorOutput"` — a saída de erro
alimenta dois nós: `Devolve a recusa`, que responde
`{ status: "error", error: … }`, e `Avisa a recusa`, que manda e-mail ao operador com o
telefone, o `externalId` e o que a cliente escreveu.

Duas coisas continuam valendo, e as duas são de propósito:

- **`neverError` segue desligado.** Foi assim que a porta fechada de 2026-09-08 ficou
  invisível por um dia. O 4xx tem de fazer o nó lançar; o que mudou é para onde ele vai.
- **O status HTTP continua 200 em qualquer desfecho.** Não é descuido: um não-2xx faz o
  canal (Cloud API, WAHA) reentregar a mensagem, e reentrega sobre recusa é laço. **Quem
  precisa reagir a uma recusa lê o corpo**, nunca o status.

Vale para qualquer rota nova atrás deste webhook, não só a de pedido.
