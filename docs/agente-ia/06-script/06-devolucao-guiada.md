# Devolução guiada — especificação (rascunho, 2026-10-07)

Só especificação. Nenhum código muda até o operador aprovar este texto e o teste real da v10 fechar.

## O que já é verdade (não reabrir)

- Cancelamento e devolução **não têm API** na Coinzz nem na Logzz (R16.9, reconfirmado em 02/10). A
  agente não executa nada: ela **guia e passa para uma pessoa** com o briefing pronto.
- Devolução é sem custo à cliente (R16.3). Troca de tamanho custa R$ 27,00, pagos por link do Mercado
  Pago, e a agente nunca diz que a troca é grátis (R17.1, gate `warranty_promise`).
- Prazo: 7 dias contados do recebimento (base de conhecimento, objeção 3).
- Caminho da Logzz: formulário, e-mail (trocasereembolsos@logzz.com.br) ou WhatsApp, com etiqueta
  pré-paga; reembolso em até 72 h úteis após a inspeção (R16.9).
- O texto é do modelo; a decisão (qual caminho, o que falta perguntar, quando passar a pessoa) é
  TypeScript determinístico (R11.1).

## O que "guiar" quer dizer

1. **Entender o pedido da cliente:** devolver, trocar tamanho ou cancelar antes da entrega. Três
   caminhos, três respostas. Pedido em rota segue `shippedCancelReply()` (grafo §54).
2. **Perguntar só o que falta**, uma coisa por vez: qual pedido (se tiver mais de um), qual o motivo
   (tamanho errado → oferece a troca antes), se já recebeu e há quantos dias.
3. **Dizer o próximo passo concreto** do caminho (formulário/e-mail/WhatsApp da Logzz, ou o link da
   troca) sem prometer prazo de reembolso além das 72 h úteis pós-inspeção.
4. **Passar a pessoa** com briefing: pedido, motivo, dias desde o recebimento, o que ela já foi
   orientada a fazer.

## Decisões em aberto (do operador)

1. O pedido pago antecipado (Coinzz) tem o mesmo caminho de devolução da Logzz? O repositório só
   documenta o da Logzz.
2. Passado o 7º dia, a agente recusa sozinha ou sempre passa a pessoa? (Recusa é promessa de política;
   proponho **sempre passar a pessoa**.)
3. Quem é a pessoa do handoff para devolução e por qual canal ela é avisada hoje?

## Guardas previstas (quando virar código)

- Teste de negação: "não quero devolver", "não preciso trocar" não abrem o caminho.
- `tests/prompt.test.ts` cobre toda frase nova do prompt; nenhum gate afrouxa (`pnpm dev:gates`).
- Entrada no grafo de decisões antes do código.
