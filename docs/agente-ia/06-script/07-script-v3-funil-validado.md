# Script v3: o funil validado do operador aplicado à Malu

> **Data:** 2026-10-19. **Status:** proposta, nada no ar. **Origem:** o primeiro teste com anúncio (16 a 19/10:
> 33 conversas, 0 links, 0 pedidos) e o material que o operador mandou no Drive "FLUXO CINTA COLETE
> MODELADORA" (script, simulação, 4 áudios, 1 vídeo, imagens, depoimentos e preços).
> **Antes de virar código:** as decisões da §5 são do operador; depois disso, cada frase nova passa pela
> cadeia de gates (`tests/prompt.test.ts`, `pnpm dev:gates`) e entra no grafo.

---

## 1. O que as 33 conversas mostram

Clientes identificadas por número de conversa (C1 a C33), nunca por nome.

| Onde ela para | Quantas | O que ela recebeu |
|---|---|---|
| Na 1ª resposta | 13 de 33 | "A gente atende bastante região… me passa seu CEP?", ou o preço seco seguido do CEP |
| Depois do CEP | ~8 de 12 | "Aí na sua região não tem pagamento na entrega… frete calculado no checkout… prazo varia, média de 5 dias úteis…" |
| Na coleta de dados | as 2 que tinham decidido | sobrenome → e-mail → CPF → "1 ou 2?" → "tamanho de cada uma das 3?" |

**Lendo como cliente:**

1. **A conversa começa ao contrário.** A mensagem pronta do anúncio ("Quais são as regiões atendidas?") abre com
   logística, e a Malu responde pedindo um dado. Ela veio de um anúncio querendo se ver bonita e ganha um balcão de
   cadastro. Nada do produto é mostrado antes de ela ter de trabalhar.
2. **Não há produto na conversa.** 7 clientes pediram foto, vídeo, catálogo ou cores (C1 duas vezes, C11, C12, C15,
   C18 duas vezes). Todas ouviram "não mando foto por aqui, vê no site". Num produto de corpo, sem imagem não há desejo.
3. **A notícia ruim vem antes do valor.** Depois do CEP, a primeira palavra é "não" e as seguintes são incerteza:
   "frete calculado no checkout" (quanto?), "o prazo varia" (quando?). Para a cliente desconfiada do Facebook, é o
   cenário de golpe.
4. **Interrogatório quando ela já disse sim.**
   - **C15** (2 peças XGG): já tinha mandado nome, endereço e e-mail; o pedido de CPF a fez sumir.
   - **C18** (3 peças): depois de escolher, ouviu duas perguntas sobre o tamanho de cada peça. O link nunca saiu.
   - **C1 e C20:** o kit foi oferecido antes do primeiro sim, e as duas pararam.
5. **Ela informa, mas não vende.** Não usa prova social nem demonstração, e quase não fala de benefício. O prompt
   ensina o que não dizer muito mais do que como vender.
6. **A régua soa como mensagem em massa.**
   - **Mensagens extras:** "Recebi sua mensagem, já te respondo" e "Ainda está aí?" 20 minutos depois.
   - **Duas de uma vez:** "Qualquer coisa é só chamar" seguido de "Posso te mandar ofertas?".
   - **Texto pronto às 9h para todo mundo:** "Ontem você chegou perto e parou… promessa demais já foi feita pra você",
     inclusive para quem mandou uma única mensagem e para quem avisou "número errado" (C17).
7. **Erro de fato:** a Malu disse a C5 que o colete "não tem zíper, fecha só com os colchetes". O produto da foto e
   do vídeo tem **colchetes e zíper**. A base de conhecimento não fala de zíper, e o modelo inventou.
8. **O público:** muitas mandam áudio; muitas vestem calça 54 ou 56 (no limite do XGG). Uma senhora de 62 anos com
   problema de vista pediu áudio 6 vezes e mandou a conta de luz; o CEP foi pedido 8 vezes.
9. **A cobertura** (já diagnosticado): 11 de 12 CEPs estão fora do pagamento na entrega. O 12º, Campinas, ouviu "não
   tem" por causa do bug da consulta (só pergunta pelo tamanho G).

## 2. Por que o funil do operador vende e a Malu não

O funil validado faz o contrário do que a Malu faz hoje:

| Funil validado | Malu hoje |
|---|---|
| Entrega valor antes de pedir qualquer coisa: 3 áudios, 1 vídeo, depoimentos, tabela de tamanho, preço | Pede o CEP na 1ª mensagem |
| Mostra o produto (vídeo de 6 s vestindo; foto; avaliações) | "Não mando foto por aqui" |
| Voz humana (áudios de 20 a 36 s) | Só texto |
| Uma oferta clara: preço, frete grátis, paga na entrega, chega amanhã, 12x | Preço, depois "depende da região", depois dados um a um |
| Fecha uma vez, com tudo numa mensagem (tamanho, nome, endereço, "posso agendar pra amanhã?") | Uma pergunta por mensagem, 5 a 7 mensagens até o link |

Em resumo: **o funil vende primeiro e pede depois; a Malu pede primeiro e nunca vende.**

## 3. O script v3, adaptado aos nossos valores

Valores conferidos em 19/10 nas páginas de checkout no ar (Logzz e Coinzz) e no `BUSINESS_CONFIG`
(`docs/operacao/business-config-2026-10-15.min.json`):

| | Na entrega (Logzz) | Antecipado (Coinzz) |
|---|---|---|
| 1 peça | **R$ 129,90** (de R$ 216,50), frete grátis | **R$ 116,91** (10% off), frete por região |
| 2 peças | R$ 233,82 (10% off) | R$ 207,84 (20% off) |
| 3 peças | R$ 311,76 (20% off) | R$ 272,79 (30% off) |
| Como paga | ao entregador, quando recebe | Pix, ou cartão em até 12x (12x de R$ 12,85, com juros) |
| Prazo | 1 a 3 dias, no dia que ela escolhe no checkout | em média 5 dias úteis, Correios ou transportadora com rastreio |
| Onde vale | só onde a consulta de cobertura confirma | em todo o Brasil |

Os dois caminhos têm 7 dias depois do recebimento para trocar ou devolver, sem custo. São 5 tamanhos (P a XGG), só
na cor preta. O material é poliéster com elastano, com forro de algodão, colchetes e nenhuma barbatana. O config
registra 500 clientes satisfeitas. Não existe entrega no mesmo dia (`expressActive: false`), e o 12x vale **só no
antecipado**: não se promete parcelamento na entrega.

### O roteiro (decisões R28)

A ordem muda num ponto em relação ao modelo do Drive: **o CEP vem antes do preço**. O áudio 4 fala de "frete grátis",
"paga direto pro entregador" e "amanhã mesmo", e isso só é verdade onde a consulta confirma o pagamento na entrega.
Com o CEP antes, cada cliente ouve só a oferta que vale para ela.

| # | Quando | Tipo | Conteúdo |
|---|---|---|---|
| 1 | 1ª mensagem dela, qualquer que seja | texto | "Oi, tudo bem? Meu nome é Malu, vou te explicar tudo sobre o nosso colete modelador 🥰" |
| 2 | | áudio 1 | gravado (36 s) |
| 3 | | áudio 2 | gravado (34 s) |
| 4 | | texto | "Veja como é simples de usar: fecha os colchetes, sobe o zíper e ajusta a alça, o corpo fica modelado em segundos 😍" |
| 5 | | vídeo | Vídeo 1 do Drive (6 s) |
| 6 | | texto | "Você pode usar embaixo de qualquer roupa: é confortável, não enrola, não dobra e não machuca. Olha o que as nossas clientes falam ❤️" |
| 7 | | imagem | Avaliações (Imagem 1 do Drive) |
| 8 | | imagem | Tabela nova ([`midia/tabela_tamanhos.png`](midia/tabela_tamanhos.png)) |
| 9 | | texto | "Pra eu te indicar o tamanho certinho, me diz o número da calça que você veste 😉" |
| 10 | ela diz o tamanho | texto (modelo) | Responde o que ela perguntou junto, diz o tamanho, e: "Me passa seu CEP que eu já vejo o dia da entrega aí pra você?" |
| 11 | CEP **com** entrega | imagem | Preço ([`midia/preco_129.png`](midia/preco_129.png)) |
| 12 | | texto | Quadro da entrega (abaixo) |
| 13 | | áudio 4 | gravado (20 s), só se a primeira data da consulta for amanhã (§5) |
| 14 | | texto | "Vamos agendar seu pedido? 😊 Só me manda seu nome completo" |
| 11' | CEP **sem** entrega | imagem | Preço ([`midia/preco_129.png`](midia/preco_129.png)) |
| 12' | | texto | Quadro do antecipado (abaixo) |
| 13' | | texto | "Me manda seu nome completo que eu já te passo o link? 😊" |
| 15 | ela manda o nome | texto + link | Mensagem do link, com o kit como opção (abaixo) |

Se ela pular etapas (manda o CEP ou o nome antes, pergunta o preço na primeira mensagem), o modelo responde o que ela
trouxe e segue a partir do que falta. Ninguém recebe o mesmo dado pedido duas vezes. O preço pedido antes do CEP vai
na hora: "Sai de R$ 216,50 por R$ 129,90, e me passa seu CEP que eu já te digo como fica a entrega aí".

**Quadro da entrega:**

> ⭐ DE R$ 216,50 POR R$ 129,90 ⭐
>
> 🚛 FRETE GRÁTIS: chega {primeira data}, no dia que você escolher
>
> 💰 PAGUE SÓ NA ENTREGA: não precisa pagar nada agora, você paga direto ao entregador
>
> 🔁 7 dias pra trocar ou devolver depois de receber

**Quadro do antecipado:**

> Pra sua cidade o colete vai pelos Correios, com código de rastreio 📦
>
> ⭐ Pagando agora você ganha 10% de desconto: R$ 116,91 ⭐ no Pix ou em até 12x no cartão
>
> 🚚 Chega em média em 5 dias úteis, e o frete aparece no checkout pelo seu CEP
>
> 🔁 7 dias pra trocar ou devolver depois de receber

**Mensagem do link (entrega):** "Prontinho, {nome}! 🎉 Seu {tamanho} por R$ 129,90, com frete grátis, e você só paga
quando receber. Escolhe aqui o dia da entrega: {link}" e, num balão separado: "Lá você só completa o endereço. E se
quiser levar mais um: 2 peças saem por R$ 233,82, e 3 por R$ 311,76 💛"

**Mensagem do link (antecipado):** "Prontinho, {nome}! 🎉 Seu {tamanho} por R$ 116,91, no Pix ou em até 12x: {link}" e
"Lá você completa o endereço e vê o frete. Se quiser levar mais: 2 peças saem por R$ 207,84, e 3 por R$ 272,79 💛"

**Régua:** uma lembrança por momento, nunca duas mensagens seguidas. Saem do ar "Recebi sua mensagem, já te respondo",
"Ainda está aí?" aos 20 minutos e o "Posso te mandar ofertas?" emendado no lembrete. O lembrete do dia seguinte fala
do ponto em que ela parou. "Número errado" e "não, obrigada" encerram a régua.

### Simulação: cliente de Belo Horizonte (tem entrega)

> **19:02 · Cliente:** Olá, tenho interesse no colete modelador!
>
> **19:02 · Malu:** Oi, tudo bem? Meu nome é Malu, vou te explicar tudo sobre o nosso colete modelador 🥰
>
> **19:02 · Malu:** 🎧 *áudio 1 (0:36)*
>
> **19:02 · Malu:** 🎧 *áudio 2 (0:34)*
>
> **19:03 · Malu:** Veja como é simples de usar: fecha os colchetes, sobe o zíper e ajusta a alça, o corpo fica modelado em segundos 😍
>
> **19:03 · Malu:** 🎬 *vídeo (0:06)*
>
> **19:03 · Malu:** Você pode usar embaixo de qualquer roupa: é confortável, não enrola, não dobra e não machuca. Olha o que as nossas clientes falam ❤️
>
> **19:03 · Malu:** 🖼️ *avaliações*
>
> **19:03 · Malu:** 🖼️ *tabela de tamanhos*
>
> **19:03 · Malu:** Pra eu te indicar o tamanho certinho, me diz o número da calça que você veste 😉
>
> **19:06 · Cliente:** uso 46. mas não marca na roupa? tenho um vestido de festa bem justinho
>
> **19:06 · Malu:** Não marca não: ele é fininho, tem forro de algodão por dentro e fica bem assentado até em vestido justinho 💛 Com 46 de calça o seu é o GG.
>
> **19:06 · Malu:** Me passa seu CEP que eu já vejo o dia da entrega aí pra você?
>
> **19:07 · Cliente:** 30230-610
>
> **19:07 · Malu:** 🖼️ *preço*
>
> **19:07 · Malu:** ⭐ DE R$ 216,50 POR R$ 129,90 ⭐ · 🚛 FRETE GRÁTIS: chega amanhã, terça, 20/10, ou no dia que você escolher · 💰 PAGUE SÓ NA ENTREGA: não precisa pagar nada agora, você paga direto ao entregador · 🔁 7 dias pra trocar ou devolver depois de receber
>
> **19:07 · Malu:** 🎧 *áudio 4 (0:20)*
>
> **19:07 · Malu:** Vamos agendar seu pedido? 😊 Só me manda seu nome completo
>
> **19:09 · Cliente:** Cláudia Ferreira Lima
>
> **19:09 · Malu:** Prontinho, Cláudia! 🎉 Seu GG por R$ 129,90, com frete grátis, e você só paga quando receber. Escolhe aqui o dia da entrega: https://entrega.logzz.com.br/pay/ccm-1-unidade?name=Cl%C3%A1udia+Ferreira+Lima&phone=55319…
>
> **19:09 · Malu:** Lá você só completa o endereço. E se quiser levar mais um: 2 peças saem por R$ 233,82, e 3 por R$ 311,76 💛
>
> **19:12 · Cliente:** agendei pra amanhã 😍
>
> **19:12 · Malu:** Que maravilha, Cláudia! Amanhã é só ficar de olho no entregador. Qualquer dúvida, me chama aqui 💛

São 11 mensagens de valor antes da primeira pergunta, 3 perguntas no total (calça, CEP, nome) e 7 minutos até o link.
Hoje, as duas clientes que mais avançaram passaram por 6 a 8 perguntas e não receberam link.

**A mesma cliente em Abaeté/MG (sem entrega), a partir do CEP:**

> **19:07 · Cliente:** 35620-000
>
> **19:07 · Malu:** 🖼️ *preço*
>
> **19:07 · Malu:** Pra sua cidade o colete vai pelos Correios, com código de rastreio 📦 · ⭐ Pagando agora você ganha 10% de desconto: R$ 116,91 ⭐ no Pix ou em até 12x no cartão · 🚚 Chega em média em 5 dias úteis, e o frete aparece no checkout pelo seu CEP · 🔁 7 dias pra trocar ou devolver depois de receber
>
> **19:07 · Malu:** Me manda seu nome completo que eu já te passo o link? 😊
>
> **19:09 · Cliente:** Cláudia Ferreira Lima
>
> **19:09 · Malu:** Prontinho, Cláudia! 🎉 Seu GG por R$ 116,91, no Pix ou em até 12x: https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?name=…
>
> **19:09 · Malu:** Lá você completa o endereço e vê o frete. Se quiser levar mais: 2 peças saem por R$ 207,84, e 3 por R$ 272,79 💛

## 4. A mensagem pronta do anúncio (Meta Ads, do sócio)

Hoje há duas: "Quais são as regiões atendidas?" e "Qual é o preço do colete?". A primeira deve sair. Proposta, igual à
da simulação validada:

> **"Olá, tenho interesse no colete modelador!"**

Ela não pede nada, convida a abertura da Etapa 1 e não leva a conversa para logística.

## 5. O que ainda depende do operador

Decididos em 19/10 (R28): áudios 1, 2 e 4 como estão; imagens novas; frete do antecipado por região; depoimentos
reais; colchetes e zíper; custo da Logzz como está no R27. Falta:

1. **Como ela paga ao entregador:** dinheiro, Pix, cartão? Nem o áudio 4 nem a base de conhecimento dizem, e é a
   pergunta mais provável depois de "pague só na entrega".
2. **O "amanhã mesmo" do áudio 4:** a consulta diz a primeira data disponível, e nem sempre é amanhã (o prazo é de 1 a
   3 dias). Proposta: o áudio 4 sai só quando a primeira data for amanhã; nos outros dias vai só o quadro escrito.
3. **"Reduz até três tamanhos de cintura" no áudio 1:** quando a cliente repetir a frase ("você disse que reduz 3
   tamanhos, emagrece?"), a Malu confirma como efeito na hora que veste e nega o emagrecimento. Hoje o gate veta "reduz
   tamanhos" no texto dela; ele precisa aceitar a frase com "vestido" e continuar vetando a promessa de emagrecer.
4. **Prova social:** fica "mais de 500 clientes satisfeitas" ao lado de "124 avaliações, nota 5", ou fica só uma?

## 6. O que precisa ser construído (depois da §5)

| Peça | Onde | Tamanho |
|---|---|---|
| Hospedar áudios, vídeo e imagens | Supabase Storage (URL pública) ou upload na API do WhatsApp | pequeno |
| Envio de mídia | `whatsapp` / "WhatsApp envio" no n8n: hoje só manda texto; precisa de `audio`, `image` e `video` | médio |
| Sequência de abertura e tamanho | `turn`: as etapas 1 e 2 como sequência fixa, com espera curta entre as mensagens | médio |
| Coleta só de nome e CEP | `identity.ts` (o CPF sai de `IDENTITY_FIELDS`) e a seção "OS DADOS E O LINK" do prompt | pequeno |
| Oferta e mensagens do link | prompt + gates (`tests/prompt.test.ts`) | médio |
| Consulta de cobertura com todos os tamanhos | `availability.ts` `lookupRegion` | pequeno |
| Régua enxuta | `followups.ts` e `opt-in.ts` | médio |
| Base de conhecimento: zíper; depoimentos reais | prompt + `testimonials` no `BUSINESS_CONFIG` | pequeno |
