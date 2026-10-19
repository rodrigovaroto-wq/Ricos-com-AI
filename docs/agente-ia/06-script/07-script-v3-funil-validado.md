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

## 3. O fluxo novo proposto

A arquitetura continua a mesma (R11.1): **a sequência de mídia é código determinístico**, igual para toda cliente, e
o modelo só escreve texto nas respostas às perguntas dela. Os áudios e imagens gravados não passam pelo modelo, então
**não passam pelos gates**: o conteúdo deles precisa estar aprovado antes (§5).

### Etapa 1: abertura (automática, na primeira mensagem dela, qualquer que seja)

| # | Tipo | Conteúdo |
|---|---|---|
| 1 | texto | "Oi, tudo bem? Eu sou a Malu, da Encorpa! Vou te mostrar tudo sobre o nosso colete modelador 🥰" |
| 2 | áudio 1 | Apresentação (36 s), gravado |
| 3 | áudio 2 | Benefícios, conforto e material (34 s), gravado |
| 4 | texto | "Olha como é simples de vestir: fecha os colchetes, sobe o zíper e pronto, o corpo fica modelado em segundos 😍" |
| 5 | vídeo | Vídeo 1 (6 s, vestindo) |
| 6 | texto | "Dá pra usar embaixo de qualquer roupa: não enrola, não dobra e não machuca. Olha o que as clientes falam ❤️" |
| 7 | imagem | Avaliações (só se forem reais, §5) |

Se ela já perguntou alguma coisa (preço, região), a sequência sai igual; o modelo responde a pergunta dela **no fim**,
numa frase só.

### Etapa 2: tamanho (automática, logo depois)

| # | Tipo | Conteúdo |
|---|---|---|
| 8 | áudio 3 | Como escolher o tamanho (29 s), gravado |
| 9 | imagem | Tabela de tamanhos (a que valer, §5) |
| 10 | texto | "Me diz o número da calça que você veste que eu te falo o tamanho certinho 😉" |

Esta é a primeira pergunta da conversa, depois de 9 mensagens de valor.

### Etapa 3: oferta e fechamento (quando ela responde o tamanho, ou pergunta preço ou como comprar)

| # | Tipo | Conteúdo |
|---|---|---|
| 11 | texto (modelo) | O tamanho dela, numa frase |
| 12 | imagem | Imagem de preço (a do preço que valer) |
| 13 | texto | O quadro de oferta (abaixo) |
| 14 | áudio 4 | Fechamento (20 s), **só se o pagamento na entrega estiver confirmado** (ver abaixo) |
| 15 | texto | "Vamos fazer seu pedido? 😊 Me manda só: ✅ seu nome completo ✅ seu CEP" |

O quadro de oferta, **antes do CEP**, não pode afirmar o que depende da região. Duas versões:

**Versão A (antes do CEP):**
> ⭐ COLETE MODELADOR por R$ {preço} ⭐
> 💰 Na maioria das cidades você paga só quando receber, direto ao entregador, com frete grátis
> 🔁 7 dias pra trocar ou devolver depois de receber
> 💳 No Pix ou no cartão, em até 12x

**Versão B (depois do CEP, com pagamento na entrega):**
> 🚛 FRETE GRÁTIS, chega {primeira data}
> 💰 PAGUE SÓ NA ENTREGA, nada agora
> + o link, com o dia escolhido no checkout

### Etapa 4: nome + CEP → link (código)

Ela manda nome completo e CEP (juntos ou separados). O código consulta a cobertura **com todos os tamanhos** (conserto
do bug) e:

- **Tem pagamento na entrega:** "Perfeito, {nome}! Aí na sua cidade você paga só quando receber, com frete grátis 🚛
  Chega {data}. Aqui seu link pra escolher o dia: {link}". O link vai na hora, sem e-mail, CPF ou pergunta de kit.
- **Não tem:** a notícia vem como solução, nunca como "não": "Pra sua cidade o envio é pelos Correios, com rastreio,
  e você ainda ganha 10% de desconto: R$ {preço antecipado}, no Pix ou em até 12x no cartão. E tem 7 dias pra
  devolver depois de receber. Aqui seu link: {link}". O valor do frete precisa estar resolvido antes (§5, item 4).

**O link sai logo depois do nome e do CEP.** E-mail, CPF e endereço completo ela preenche no checkout (decisão do
operador, 19/10). O kit de 2 ou 3 peças aparece **dentro** da mensagem do link, como opção, nunca como pergunta antes
dele.

### Etapa 5: depois do link e régua

- **Uma lembrança por momento**, nunca duas mensagens seguidas. Saem do ar "Recebi sua mensagem, já te respondo",
  "Ainda está aí?" aos 20 minutos e o "Posso te mandar ofertas?" emendado no lembrete.
- **O lembrete do dia seguinte fala do que ela viu**, não de uma objeção que ela não fez: para quem parou antes do
  tamanho, o vídeo ou a avaliação; para quem parou depois do link, "seu pedido ficou separado aqui, quer que eu
  guarde?".
- **"Número errado" e "não, obrigada" encerram a régua.**

## 4. A mensagem pronta do anúncio (Meta Ads, do sócio)

Hoje há duas: "Quais são as regiões atendidas?" e "Qual é o preço do colete?". A primeira deve sair. Proposta, igual à
da simulação validada:

> **"Olá, tenho interesse no colete modelador!"**

Ela não pede nada, convida a abertura da Etapa 1 e não leva a conversa para logística.

## 5. Decisões do operador antes de construir

O material do Drive conflita com o que está no ar e com decisões já registradas. Nada disto é técnico; é do operador.

1. **Preço.** O script e as imagens dizem R$ 119,90 (12x de R$ 12,16). O ar diz R$ 129,90 na entrega e R$ 116,91 no
   antecipado. Há imagens de R$ 89, R$ 99, R$ 119 e R$ 129. Qual vale, e para qual caminho?
2. **Tabela de tamanhos.** Há três tabelas diferentes:
   - **A da Malu:** P a XGG por cintura em cm (P 60–68 a XGG 92–100).
   - **A imagem do Drive:** G 40–44, XG 44–48, XXG 48–52, 3XG 52+ pela calça.
   - **A simulação:** M, L, XL, 2XL, 3XL.

   O checkout tem 5 SKUs: P, M, G, GG e XGG. Qual tabela é a verdadeira? E o XGG serve em quem veste 54 ou 56?
3. **Promessas dos áudios gravados**, que não passam por gate. Elas contrariam regras que o projeto já decidiu (R11, as
   "três coisas que você nunca inventa", compliance de anúncio com apelo de corpo):
   - **Áudio 1:** "reduz até três tamanhos de cintura imediatamente", "sem barriga", "febre nos Estados Unidos", "sem
     precisar passar horas na academia".
   - **Áudio 3:** "corrige até a postura".
   - **Texto de preço:** "Receba amanhã mesmo" e "FRETE GRÁTIS" valem só onde há entrega; "parcele em até 12x pagando
     ao entregador no crédito": a Logzz aceita cartão parcelado na porta?

   Manter os áudios como estão, regravar só esses trechos, ou cortar?
4. **Frete do antecipado.** É o caminho de 11 de 12 clientes. Hoje o checkout cobra o frete por região, e a Malu não
   sabe o valor: a cotação vai de cerca de R$ 28 (MG e SP) a cerca de R$ 93 (interior de PE). Frete grátis no
   antecipado (a margem absorve), um valor fixo, ou continua por região?
5. **Depoimentos.** As avaliações (124, nota 5) e as duas capturas ("Brenda", "Regina", de 2024) são de clientes reais
   deste colete? A Malu só pode mostrar depoimento real (`testimonials` está vazio no config). Se forem de outra loja
   ou de outro produto, não entram.
6. **Zíper.** O produto atual tem colchetes **e** zíper, como na foto e no vídeo? Se sim, entra na base de
   conhecimento, e "não tem zíper" vira proibido.

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
| Base de conhecimento: zíper e tabela | prompt + `sizing.ts` | pequeno |
