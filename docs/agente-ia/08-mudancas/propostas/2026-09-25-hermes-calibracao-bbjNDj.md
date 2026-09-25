# Propostas do Hermes — 2026-09-25 — hermes-calibracao-bbjNDj

A rodada tem uma promessa de data certa que passou (Tati recebe 'chega amanhã'), uma resposta pronta por price_promise na pergunta do frete (Cleide) e o retorno do link repetido (Jussara). As três retomam ou estendem entradas existentes sem reabrir as cinco decisões do regras.md.

## Propostas para decidir (3)

### H-1 · gate:delivery_promise · alta
- **O quê:** Vetar promessa de dia certo na entrega (amanhã, hoje, dia da semana) quando o dia só aparece no checkout.
- **Por quê:** A Malu prometeu 'chega amanhã certinho' a uma cliente decidindo pela data, e a operação só garante até 3 dias com escolha no checkout. Data errada na porta custa reentrega, troca ou confiança.
- **Objetivo:** Nenhuma resposta promete data certa de entrega; o dia segue vindo só do checkout.
- **Como medir:** checagem nova: nenhuma resposta da Malu promete dia certo de entrega (amanhã, hoje, dia da semana ou data) quando o dia só aparece no checkout
- **Evidência:**
  - persona-tati, Malu 4: "Seu tamanho é o M pra quem veste 38, vai ficar certinho em você, e chega amanhã certinho aí, pode ficar tranquila" — **hoje:** vetada por delivery_promise

### H-2 · gate:price_promise · alta · retoma M-05
- **O quê:** Não ler resposta sobre o valor do frete como concessão de desconto sem número.
- **Por quê:** A pergunta sobre o frete para Manaus levou três vetos price_promise e virou resposta pronta, escondendo justamente o valor pedido. É a segunda pronta por price_promise depois da M-05, que tinha zerado na R6.
- **Objetivo:** Nenhuma resposta pronta causada por price_promise; pergunta de frete recebe o valor ou a regra do frete, sem fallback.
- **Como medir:** pronta-por-preco
- **Mentira vizinha que continua vetada:** Frase como 'te dou um desconto no frete' ou 'faço um precinho no frete' continua vetada.
- **Evidência:**
  - persona-cleide, Malu 3: "Deixa eu confirmar isso direitinho e já te respondo, tá?" — **hoje:** passa pelos gates

### H-3 · config:linkSentRecently · media · retoma M-03
- **O quê:** Bloquear o reenvio do mesmo checkout dentro de 3 respostas quando não há pedido explícito de link.
- **Por quê:** O mesmo checkout saiu na Malu 11 e de novo na Malu 13 sem pedido da cliente, repetindo a falha da R4 que a M-03 tinha zerado na R5.
- **Objetivo:** Nenhum link repetido dentro de 3 respostas sem pedido da cliente.
- **Como medir:** link-repetido
- **Evidência:**
  - persona-jussara, Malu 11: "https://entrega.logzz.com.br/pay/encorpa-pa?name=Jussara+Menezes&phone=5500099141470" — **hoje:** passa pelos gates
  - persona-jussara, Malu 13: "Aqui o link de novo: https://entrega.logzz.com.br/pay/encorpa-pa?name=Jussara+Menezes&phone=5500099141470" — **hoje:** passa pelos gates

---
Modelo muse-spark-1.3-contributor · 5 conversas · 96 s · custo US$ 0.0047 (123011 tokens, 6 chamadas)
