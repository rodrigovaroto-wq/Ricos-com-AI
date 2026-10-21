# Mensagens prontas da Malu — proposta de reescrita (v4, 2026-10-20)

Pedido do operador (teste real de 20/10): menos emoji, menos "gatilho de vendedor", um assunto por linha, com respiro entre eles.
Cada item mostra **hoje** (o que sai no ar, v37) e a **proposta**. Nada aqui está no ar: o operador aprova, corrige ou recusa item a
item, e só depois a mudança é implementada, testada e publicada.

## No ar desde 2026-10-21 (v39): oferta e link no texto final do operador (grafo §121)

Substituem as propostas 2.1, 2.3, 3.1 e 3.2 abaixo. Fonte: `codOfferText`, `prepayOfferText` e `funnelLinkMessage` em `src/agent/funnel.ts`.

**Oferta, pagamento na entrega** (primeira data do checkout amanhã; outra data: "Seu Pedido Chegará já *quinta (23/10)!!*"; sem data:
"Seu Pedido Chegará em *1 a 3 dias!!*" e "Você escolhe o dia lá no checkout."):
```
⭐*~R$ 216,50~ POR R$ 129,90*⭐

🚚 *FRETE GRÁTIS*
Seu Pedido Chegará em *Menos de 24 Horas!!*

Ou se preferir outro dia, é só escolher lá no checkout.

✅*Não Paga Nada Agora*, só quando chegar aí, no dinheiro, Pix ou cartão!

🔁 *7 Dias de Garantia* pra trocar ou devolver se não gostar.
```

**Oferta, antecipado:**
```
Você Ganhou um Desconto Adicional de *10%!!!*

⭐*~R$ 216,50~ POR R$ 116,91*⭐

🚚 Seu colete vai pelos Correios, com código de rastreio.

✅ Você pode pagar agora no Pix ou em até *12x no cartão!*

🔁 *7 Dias de Garantia* pra trocar ou devolver se não gostar
```

**Link, pagamento na entrega:**
```
Pronto, Claudia! 🎉
Seu Colete no G por R$ 129,90, com frete grátis, e você só paga quando receber!!

É só abrir o link, completar o endereço e escolher o dia da entrega que preferir: https://entrega.logzz.com.br/...

Valores dos Kits
• 2 peças saem por apenas *R$ 116,91* cada!
• 3 peças saem por apenas *R$ 103,92* cada!
```

**Link, antecipado:**
```
Pronto, Claudia! 🎉
Seu Colete no G por R$ 116,91, no Pix ou em até 12x no cartão.

No link você preenche seus dados e o endereço, aí é só ser feliz: https://app.coinzz.com.br/...

Valores dos Kits
• 2 peças saem por apenas *R$ 103,92* cada!
• 3 peças saem por apenas *R$ 90,93* cada!
```

## Princípios da reescrita

1. **Um assunto por bloco**, com uma linha em branco entre eles. O WhatsApp é lido no celular, de relance.
2. **No máximo um emoji por mensagem**, e só onde ele substitui um tom de voz (💛 no fecho). Nada de ⭐🚛💰🔁 em lista.
3. **Sem caixa alta e sem "gatilho" explícito** (FRETE GRÁTIS, PAGUE SÓ NA ENTREGA, "febre", "imediatamente"). A persuasão vem
   da clareza (preço, prazo e risco zero ditos sem esforço), da especificidade (o dia da entrega, o tamanho dela) e da reversão de
   risco (só paga quando receber, e ainda tem 7 dias pra devolver), que é o argumento mais forte desta oferta.
4. **Fala de gente**: frases curtas, "você", sem jargão ("modalidade", "etapa").
5. **Uma pergunta só, no fim**, e só quando ela leva a venda adiante.
6. **Os números continuam vindo do config** (preço, desconto, kits, prazo, garantia). Abaixo eles aparecem com os valores de hoje.

> **Fora desta proposta:** os 3 áudios gravados (são do operador; o áudio 1 tem "reduz até três tamanhos imediatamente" e "febre
> nos Estados Unidos", que o parecer de conformidade apontou — vale regravar), e os 3 templates aprovados pela Meta (cupom do dia,
> véspera da entrega e véspera paga): mudar o texto deles exige nova aprovação na Meta, que é do sócio.

---

## 1. Abertura (primeira mensagem dela)

**1.1 Apresentação**
- Hoje: `Olá, tudo bem?` / `Meu nome é Malu, vou te explicar tudo sobre a nossa cinta modeladora 🥰`
- Proposta:
  > Oi, tudo bem? Aqui é a Malu, da Encorpa.
  >
  > Vou te mostrar rapidinho como o colete funciona 💛

**1.2 Antes do vídeo**
- Hoje: `Veja como é simples de usar: é só vestir, fechar os colchetes e o zíper e ajustar a alça, o corpo fica modelado em segundos 😍`
- Proposta:
  > Olha como é simples de vestir: fecha os colchetes, sobe o zíper e ajusta a alça.

**1.3 Depois do vídeo, antes das avaliações**
- Hoje: `Você pode usar embaixo de qualquer roupa: ela é super confortável, não enrola, não dobra e não machuca. Já são mais de 500 clientes satisfeitas e 124 avaliações positivas ❤️`
- Proposta:
  > Ele fica por baixo de qualquer roupa, sem marcar.
  >
  > É forrado em algodão, não enrola e não machuca.
  >
  > Já são mais de 500 clientes e 124 avaliações. Olha algumas:

  (Os números 500 e 124 continuam vindo do config; o parecer de conformidade pediu a prova arquivada deles.)

**1.4 Pergunta do tamanho (fecha a abertura)**
- Hoje: `Qual o número da calça que você veste? Assim eu te indico o tamanho certinho 😉`
- Proposta:
  > Pra eu te indicar o tamanho certo: qual o número da calça que você usa?

---

## 2. Oferta depois do CEP

**2.1 Onde tem pagamento na entrega (quadro de hoje com ⭐🚛💰🔁)**
- Hoje:
  ```
  ⭐ DE R$ 216,50 POR R$ 129,90 ⭐
  🚛 FRETE GRÁTIS: a primeira data de entrega é amanhã, quarta (21/10), ou o dia que você escolher
  💰 PAGUE SÓ NA ENTREGA: não precisa pagar nada agora, você paga direto ao entregador, no dinheiro, Pix ou cartão
  🔁 7 dias pra trocar ou devolver depois de receber
  ```
- Proposta:
  > Boa notícia: aí tem entrega com pagamento na hora.
  >
  > De R$ 216,50 por R$ 129,90, com frete grátis.
  >
  > Você não paga nada agora. Paga ao entregador quando receber, no dinheiro, Pix ou cartão.
  >
  > A primeira data de entrega é amanhã, quarta (21/10), ou o dia que você preferir.
  >
  > E depois de receber, ainda tem 7 dias pra trocar ou devolver.

  (Sem data do checkout: "Chega em 1 a 3 dias, no dia que você escolher.")

**2.2 Pergunta depois da oferta da entrega**
- Hoje: `Vamos agendar seu pedido? 😊 Só me manda seu nome completo`
- Proposta:
  > Quer que eu já deixe o seu agendado? Me manda seu nome completo.

**2.3 Onde só tem o antecipado**
- Hoje:
  ```
  Pra sua cidade o colete vai pelos Correios, com código de rastreio 📦
  ⭐ Pagando agora você ganha 10% de desconto: R$ 116,91 ⭐ no Pix ou em até 12x no cartão
  🚚 Chega em média em 5 dias úteis, e o frete aparece no checkout pelo seu CEP
  🔁 7 dias pra trocar ou devolver depois de receber
  ```
- Proposta:
  > Pra sua cidade o colete vai pelos Correios, com rastreio.
  >
  > Pagando antecipado sai por R$ 116,91 (10% de desconto), no Pix ou em até 12x no cartão.
  >
  > O frete aparece no checkout pelo seu CEP, e o prazo varia por região, em média 5 dias úteis.
  >
  > E depois de receber, você tem 7 dias pra trocar ou devolver.

**2.4 Pergunta depois do antecipado**
- Hoje: `Me manda seu nome completo que eu já te passo o link? 😊`
- Proposta:
  > Me manda seu nome completo que eu já te passo o link.

**2.5 O tamanho dela sem entrega, depois de a oferta da entrega já ter ido**
- Hoje: `No M o pagamento na entrega não está disponível aí agora, então o seu vai pelo antecipado 💛`
- Proposta:
  > No M, o pagamento na entrega não está disponível na sua região agora. Pra você, vai pelo antecipado:

---

## 3. Link do checkout

**3.1 Pagamento na entrega**
- Hoje: `Prontinho, Claudia! 🎉 Seu G por R$ 129,90, com frete grátis, e você só paga quando receber. Escolhe aqui o dia da entrega:` + link + `Lá você só completa o endereço.` + kits
- Proposta:
  > Pronto, Claudia! Seu G por R$ 129,90, com frete grátis, e você só paga quando receber.
  >
  > É só abrir o link, completar o endereço e escolher o dia da entrega:
  > https://entrega.logzz.com.br/...
  >
  > Se quiser levar mais de uma:
  > • 2 peças por R$ 233,82 (10% de desconto)
  > • 3 peças por R$ 311,76 (20% de desconto)

**3.2 Antecipado**
- Hoje: `Prontinho, Claudia! 🎉 Seu G por R$ 116,91, no Pix ou em até 12x no cartão:` + link + `Lá você completa o endereço e vê o frete.` + kits
- Proposta:
  > Pronto, Claudia! Seu G por R$ 116,91, no Pix ou em até 12x no cartão.
  >
  > No link você preenche seus dados e o endereço, e já vê o frete:
  > https://app.coinzz.com.br/...
  >
  > Se quiser levar mais de uma:
  > • 2 peças por R$ 207,84 (20% de desconto)
  > • 3 peças por R$ 272,79 (30% de desconto)

  ("seus dados": o checkout da Coinzz pede e-mail e CPF antes do endereço, ver grafo §116.)

**3.3 Endereço novo sem entrega, depois de um link da entrega**
- Hoje: `Nesse endereço o pagamento na entrega não chega, então o seu vai pelo antecipado 💛`
- Proposta:
  > Nesse endereço novo não tem entrega com pagamento na hora, então o seu vai pelo antecipado:

---

## 4. Os dois links (a consulta falhou numa cidade que costuma ter entrega)

- Hoje: 4 balões, com "a nossa consulta de CEP está instável agora 😕", 🟢 1) PAGAR SÓ NA ENTREGA · …, 🔵 2) PAGAR AGORA NO PIX OU CARTÃO · …
- Proposta (3 balões):
  > Não consegui confirmar a entrega no seu CEP agora, mas a sua cidade costuma ter. Vou te mandar as duas opções:

  > **1. Pagar só quando receber — R$ 129,90, frete grátis**
  > Abre esse primeiro. Se aparecer um dia de entrega pra escolher, é só finalizar:
  > https://entrega.logzz.com.br/...

  > **2. Pagar agora — R$ 116,91 (10% de desconto), no Pix ou em até 12x**
  > Se no primeiro não aparecer entrega pra você, vai por esse, pelos Correios com rastreio:
  > https://app.coinzz.com.br/...

---

## 5. Respostas fixas do atendimento

**5.1 Endereço novo antes do pedido**
- Hoje: `Claro! Só que o endereço novo pode estar fora da nossa rede de entrega, então preciso consultar de novo 😊 Me passa o CEP novo, ou a rua e a cidade?`
- Proposta:
  > Claro! Só preciso consultar de novo, porque o endereço novo pode estar fora da nossa rede de entrega.
  >
  > Me passa o CEP novo (ou a rua e a cidade)?

**5.2 Pedido não encontrado**
- Hoje: `Não estou encontrando o seu pedido aqui por um problema no sistema 😕 Manda uma mensagem pra nossa equipe de atendimento ao cliente no WhatsApp +55 11 98819-4261, que eles conferem pra você 💛`
- Proposta:
  > Não estou conseguindo achar o seu pedido aqui, por um problema no sistema.
  >
  > Manda uma mensagem pra nossa equipe de atendimento ao cliente, que eles conferem pra você:
  > WhatsApp +55 11 98819-4261

**5.3 Troca ou devolução (depois do pedido)**
- Hoje: `Pra trocar, devolver ou mudar o endereço do pedido, é só chamar o nosso atendimento ao cliente no WhatsApp +55 11 98819-4261 💛 Lá você pede o que precisa, e eles resolvem pra você. A troca é sem custo pra você. Você tem 7 dias pra trocar ou devolver depois que receber.`
- Proposta:
  > Você tem 7 dias depois de receber pra trocar ou devolver, e a troca é sem custo pra você.
  >
  > É só chamar a nossa equipe de atendimento ao cliente, que eles resolvem:
  > WhatsApp +55 11 98819-4261

**5.4 Saudação de quem volta no dia seguinte**
- Hoje: `Oii, tudo bem? Deseja continuar com seu pedido?` — e, em seguida, a resposta do modelo (que também cumprimenta). Na conversa real
  de 20/10 (…9446) saíram as duas: "Oii, tudo bem? Deseja continuar…" e "Bom dia! O que travou…".
- Proposta: a saudação fixa só sai quando ela volta **sem** dizer nada a responder (um "oi"); quando ela volta com uma pergunta ou um
  problema, só a resposta. Texto:
  > Oi, que bom te ver de novo! Quer continuar de onde paramos?

---

## 6. Régua (mensagens de acompanhamento, dentro da janela de 24 h)

**6.1 15 min depois do link**
- Hoje: `Vi que seu pedido ainda não foi finalizado, travou em alguma etapa?`
- Proposta:
  > Conseguiu finalizar? Se travou em alguma parte, me conta que eu te ajudo.

**6.2 1 h de silêncio, antes do tamanho** (hoje: "Ficou alguma dúvida…" e "Pensa naquela roupa parada no armário…")
- Proposta (2 variantes):
  > Ficou alguma dúvida? Me fala o número da sua calça que eu te digo o tamanho certo.

  > Sabe aquela roupa parada no armário? Me fala o número da sua calça que eu te digo qual colete deixa ela do jeito que você gosta.

**6.3 1 h de silêncio, depois do preço, com entrega** (hoje: "Qualquer coisa é só chamar! Lembrando que você não paga nada agora…" e "Fico por aqui… não sai nada do seu bolso…")
- Proposta:
  > Fico por aqui se precisar.
  >
  > Lembrando: você não paga nada agora, só quando o colete chegar.

  > Qualquer dúvida, é só chamar.
  >
  > Você vê o colete na entrega e paga ali mesmo, e ainda tem 7 dias pra devolver se não gostar.

**6.4 1 h de silêncio, sem região conhecida** (hoje: "…Me passa seu CEP quando quiser…" e "Fico por aqui… Com o seu CEP eu te mostro…")
- Proposta:
  > Fico por aqui se precisar. Quando quiser, me passa seu CEP que eu te mostro como fica a entrega aí.

  Achado: depois de "eu não sei o cep" (conversa real …5787, 19/10), a régua ainda mandou "Com o seu CEP eu te mostro…". Proposta
  para esse caso:
  > Fico por aqui se precisar. Se quiser, me passa a rua e a cidade que eu acho o CEP pra você.

**6.5 1 h de silêncio, antecipado** (hoje: "Qualquer coisa é só chamar! Lembrando que no pagamento antecipado você leva o colete com 10% de desconto: R$ 116,91. No antecipado, o prazo varia…")
- Proposta:
  > Fico por aqui se precisar.
  >
  > No antecipado o colete sai por R$ 116,91 (10% de desconto), e chega em média em 5 dias úteis.

**6.6 1 h de silêncio, depois do link** (hoje: "Conseguiu finalizar seu pedido? …😊" e "Passando pra ver: deu certo de fechar o pedido? …")
- Proposta:
  > Deu certo de finalizar? Se quiser, te mando o link de novo.

**6.7 Manhã seguinte** (hoje: "Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente…", longo)
- Proposta, com entrega:
  > Bom dia! Passando pra lembrar que você não precisa confiar no escuro: o colete chega, você vê e só paga na hora.
  >
  > E ainda tem 7 dias pra devolver, sem custo.

- Proposta, antecipado:
  > Bom dia! Se ficou alguma dúvida, me conta.
  >
  > Depois que o colete chegar, você tem 7 dias pra devolver se não for o que esperava, sem custo nenhum.

- Proposta, sem região:
  > Bom dia! Ficou alguma dúvida sobre o colete? Me conta que eu te ajudo.

**6.8 Depois do pedido**
- Pedido confirmado — hoje: `Pedido confirmado! 🎉 1 peça no G, R$ 129,90 na entrega, indo pra … Eu vou acompanhar sua entrega do começo ao fim — qualquer coisa, é só me chamar aqui mesmo.`
- Proposta:
  > Pedido confirmado! Seu G, R$ 129,90 pra pagar na entrega.
  >
  > Qualquer dúvida sobre a entrega, é só me chamar aqui.

- Saiu para entrega — hoje: `Oi! Seu colete já está a caminho 🚚 Qualquer dúvida…`
- Proposta:
  > Seu colete já saiu pra entrega! Qualquer dúvida, me chama aqui.

- Entregue — hoje: 3 linhas ("Chegou?! 😍 …", "Dica de primeira vez…", "…foto do antes e depois…")
- Proposta:
  > Chegou? Me conta o que achou!
  >
  > Dica: nos primeiros dias, feche os colchetes na fileira mais folgada e vá apertando com o uso. Fica bem mais confortável.

---

## Como seguir

Responda por número (ex.: "1.1 ok, 1.3 trocar X por Y, 4 não"). O que for aprovado eu implemento com os testes de sempre (toda frase
nova passa pela cadeia de gates e por uma simulação), registro no grafo e publico numa versão só.
