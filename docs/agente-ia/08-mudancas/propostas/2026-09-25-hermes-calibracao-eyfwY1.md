# Propostas do Hermes — 2026-09-25 — hermes-calibracao-eyfwY1

Rodada com 5 conversas e 3 falhas caras: uma promessa de chegada 'amanhã' que passou sem veto (Tati), uma resposta pronta por price_promise em pergunta de frete (Cleide) e um link idêntico reenviado em 2 respostas (Jussara). As duas últimas reabrem M-05 e M-03, zeradas na R5/R6.

## Propostas para decidir (3)

### H-1 · gate:delivery_promise · alta
- **O quê:** Vetar promessa de data absoluta de entrega ('chega amanhã', 'chega hoje') sem confirmação de CEP/checkout
- **Por quê:** A Malu prometeu chegada 'amanhã certinho' para São Paulo sem consulta, e a resposta saiu sem veto. É mentira que passou: se não chega, custa o frete na porta e a confiança.
- **Objetivo:** Nenhuma resposta promete dia absoluto de chegada; a data só aparece como escolha no checkout
- **Como medir:** checagem nova: promessa-de-data (nenhuma resposta com data absoluta de entrega como 'amanhã'/'hoje' passa); acompanhar pronta-por-prazo = 0
- **Evidência:**
  - persona-tati, Malu 4: "Seu tamanho é o M pra quem veste 38, vai ficar certinho em você, e chega amanhã certinho aí, pode ficar tranquila" — **hoje:** vetada por delivery_promise

### H-2 · gate:price_promise · alta · retoma M-05
- **O quê:** Distinguir resposta honesta sobre valor do frete da promessa de desconto sem número
- **Por quê:** Na pergunta sobre o frete para Manaus o gate vetou três rascunhos como promessa de desconto e saiu a resposta pronta. Retoma a M-05, que tinha zerado pronta-por-preco na R6 e voltou a falhar nesta rodada.
- **Objetivo:** Nenhuma resposta pronta causada por price_promise em pergunta de frete
- **Como medir:** pronta-por-preco
- **Mentira vizinha que continua vetada:** 'o frete sai por menos pra você' ou 'faço o frete grátis' sem valor no config continuam vetadas
- **Evidência:**
  - persona-cleide, Malu 3: "Deixa eu confirmar isso direitinho e já te respondo, tá?" — **hoje:** passa pelos gates

### H-3 · interpretador · media · retoma M-03
- **O quê:** Não reenviar o mesmo checkout dentro de 3 respostas quando a cliente diz que vai abrir/fazer, só em pedido explícito de novo link
- **Por quê:** O mesmo link saiu na Malu 11 e de novo na Malu 13, com a cliente só confirmando que ia fazer. Retoma a M-03, atingida na R5 e de volta a falhar nesta rodada.
- **Objetivo:** link-repetido = 0; 'vou abrir aqui e fazer' não conta como pedido de link
- **Como medir:** link-repetido
- **Evidência:**
  - persona-jussara, Malu 11: "https://entrega.logzz.com.br/pay/encorpa-pa?name=Jussara+Menezes&phone=5500099141470" — **hoje:** passa pelos gates
  - persona-jussara, Malu 13: "Aqui o link de novo: https://entrega.logzz.com.br/pay/encorpa-pa?name=Jussara+Menezes&phone=5500099141470" — **hoje:** passa pelos gates

---
Modelo muse-spark-1.3-contributor · 5 conversas · 92 s · custo US$ 0.0049 (129392 tokens, 6 chamadas)
