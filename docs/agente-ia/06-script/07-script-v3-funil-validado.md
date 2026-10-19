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

## 3. O script adaptado aos nossos valores

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

### Etapa 1: abertura (automática, na primeira mensagem dela, qualquer que seja)

| # | Tipo | Conteúdo |
|---|---|---|
| 1 | texto | "Oi, tudo bem? Eu sou a Malu, da Encorpa! Vou te mostrar tudinho sobre o nosso colete modelador 🥰" |
| 2 | áudio A | Apresentação (texto na §3.1) |
| 3 | áudio B | Conforto e material (§3.1) |
| 4 | texto | "Olha como é simples de vestir: fecha os colchetes, ajusta e pronto, a roupa já cai diferente 😍" |
| 5 | vídeo | Vídeo 1 do Drive (6 s, vestindo) |
| 6 | texto | "Dá pra usar embaixo de qualquer roupa: é fininho, não enrola e não marca. Já são mais de 500 clientes satisfeitas ❤️" |
| 7 | imagem | Avaliações, **só se forem reais** (§5) |

Se ela já perguntou alguma coisa (preço, região), a sequência sai igual, e no fim o modelo responde a pergunta dela
numa frase.

### Etapa 2: tamanho (automática, logo depois)

| # | Tipo | Conteúdo |
|---|---|---|
| 8 | áudio C | Como escolher o tamanho (§3.1) |
| 9 | imagem | Tabela **nova**, com a nossa (abaixo) |
| 10 | texto | "Me diz o número da calça que você veste que eu te falo o tamanho certinho 😉" |

A tabela que vai na imagem é a do repositório (`02-tabela-de-medidas.md` e `sizing.ts`). A imagem do Drive (G a 3XG)
não serve:

| Tamanho | Calça | Cintura |
|---|---|---|
| P | 34 a 36 | 60 a 68 cm |
| M | 38 a 40 | 68 a 76 cm |
| G | 42 a 44 | 76 a 84 cm |
| GG | 46 a 48 | 84 a 92 cm |
| XGG | 50 a 52 | 92 a 100 cm |

"Ficou entre dois? Pegue o maior."

### Etapa 3: oferta e fechamento (quando ela diz o tamanho, ou pergunta preço ou como comprar)

| # | Tipo | Conteúdo |
|---|---|---|
| 11 | texto (modelo) | O tamanho dela, numa frase ("Com 46 o seu é o GG 😊") |
| 12 | imagem | Preço **novo**: "De R$ 216,50 por R$ 129,90". A imagem "129" do Drive diz "12x de R$ 13,16", que não existe (§5) |
| 13 | texto | O quadro de oferta (abaixo) |
| 14 | texto | "Vamos fazer seu pedido? 😊 Me manda só: ✅ seu nome completo ✅ seu CEP, que eu já vejo o dia da entrega aí" |

O quadro de oferta, antes do CEP, não pode afirmar o que depende da região:

> ⭐ DE R$ 216,50 POR R$ 129,90 ⭐
>
> 💰 Na maioria das cidades você paga só quando receber, direto ao entregador, e o frete é grátis
>
> 🚚 Chega em 1 a 3 dias, no dia que você escolher
>
> 🔁 7 dias pra trocar ou devolver depois de receber, sem custo

### Etapa 4: nome + CEP → link (código)

Ela manda nome completo e CEP (juntos ou separados). O código consulta a cobertura **com todos os tamanhos** (conserto
do bug) e:

- **Tem pagamento na entrega:** áudio D (§3.1), depois:
  > Perfeito, {nome}! 🎉 Aí na sua cidade você paga só quando receber, com frete grátis: R$ 129,90 no {tamanho}.
  > Chega a partir de {primeira data}, você escolhe o dia aqui: {link}
  >
  > Se quiser aproveitar: 2 peças saem por R$ 233,82 e 3 por R$ 311,76 💛
- **Não tem:** a notícia vem como solução, nunca como "não":
  > {nome}, pra sua cidade o colete vai pelos Correios, com código de rastreio 📦 E pagando agora você ganha 10% de
  > desconto: R$ 116,91 no {tamanho}, no Pix ou em até 12x no cartão. Chega em média em 5 dias úteis, e você tem 7 dias
  > depois de receber pra devolver se não gostar. Seu link: {link}
  >
  > 2 peças saem por R$ 207,84 e 3 por R$ 272,79 💛

O frete do antecipado é cobrado no checkout e muda por região; a Malu não sabe o valor (§5).

**O link sai logo depois do nome e do CEP.** E-mail, CPF e endereço completo ela preenche no checkout (decisão do
operador, 19/10). O kit vai dentro da mensagem do link, nunca como pergunta antes dele.

### Etapa 5: depois do link e régua

- **Uma lembrança por momento**, nunca duas mensagens seguidas. Saem do ar "Recebi sua mensagem, já te respondo",
  "Ainda está aí?" aos 20 minutos e o "Posso te mandar ofertas?" emendado no lembrete.
- **O lembrete do dia seguinte fala do que ela viu**, não de uma objeção que ela não fez: para quem parou antes do
  tamanho, o vídeo; para quem parou depois do link, "seu pedido ficou separado aqui, quer que eu guarde?".
- **"Número errado" e "não, obrigada" encerram a régua.**

### 3.1 Os áudios: o que está gravado, o que serve, e o texto para regravar

Transcritos em 19/10 com a mesma transcrição que a Malu usa (`muse-voice-transcribe-1.0`). O que foi dito bate com o
texto do Google Doc.

| Áudio | Duração | Dá pra usar? | O que impede |
|---|---|---|---|
| 1 | 36 s | **Não** | "Meu nome é Maria Luiza" (a Malu nunca afirma ser uma pessoa), "sem barriga", "febre nos Estados Unidos", "reduz até três tamanhos de cintura imediatamente", "sem precisar passar horas na academia" |
| 2 | 34 s | **Em parte** | "seios mais levantados e a barriga retinha" é promessa de corpo; "ajustar ao seu zíper" depende de o colete ter zíper (§5). O resto está certo |
| 3 | 29 s | **Não** | "corrige até a postura" (a regra é "dá um apoio enquanto está vestido, não trata coluna"); medir com fita "na altura do umbigo" contraria a tabela por calça (decisão de 04/09). Os "cinco tamanhos, todos na cor preta" estão certos |
| 4 | 20 s | **Não** | "frete grátis" e "paga ao entregador" valem só onde há entrega e saem antes do CEP; "agendar pra amanhã mesmo" não é garantido (1 a 3 dias) |

Texto proposto para regravar, mantendo o tom e a duração dos originais:

- **Áudio A (apresentação, ~30 s):** "Oi, tudo bem? Aqui é a Malu, da Encorpa! Vou te contar rapidinho sobre o nosso
  colete modelador. Sabe aquela roupa que você ama, mas deixou no armário porque marca a barriguinha ou as costas?
  Com o colete ela volta a cair do jeito que você quer: ele modela a cintura e alinha a silhueta na hora que você
  veste. Dá pra usar blusinha de alcinha, vestido mais justinho, calça de cintura alta, sem marcar nada."
- **Áudio B (conforto, ~30 s):** "E o melhor é que é confortável de verdade. Ele tem forro de algodão por dentro, não
  tem barbatana, não enrola e não marca embaixo da roupa. Você fecha os colchetes e deixa do seu jeito, mais
  justinho ou mais soltinho. Já são mais de quinhentas clientes satisfeitas, e eu sempre recebo mensagem de cliente
  feliz com o caimento da roupa."
- **Áudio C (tamanho, ~20 s):** "Pra acertar o seu tamanho é bem fácil: é só me dizer o número da calça que você
  veste. A gente tem do P ao XGG, todos no preto. Vou te mandar a tabelinha aqui embaixo, e se ficar entre dois,
  pega o maior, que fica mais confortável."
- **Áudio D (fechamento, só onde há entrega, ~20 s):** "Que bom! Aí na sua cidade você não paga nada agora: o
  entregador leva o colete até a sua casa e você paga só quando receber, com frete grátis. E se não gostar, tem sete
  dias pra devolver. Te mandei o link pra você escolher o melhor dia da entrega, tá bom?"

Os áudios não passam pela checagem automática da Malu: o texto aprovado aqui é a única guarda deles.

## 4. A mensagem pronta do anúncio (Meta Ads, do sócio)

Hoje há duas: "Quais são as regiões atendidas?" e "Qual é o preço do colete?". A primeira deve sair. Proposta, igual à
da simulação validada:

> **"Olá, tenho interesse no colete modelador!"**

Ela não pede nada, convida a abertura da Etapa 1 e não leva a conversa para logística.

## 5. O que ainda depende do operador

1. **Os áudios:** quem regrava os textos da §3.1, e com qual voz? Uma voz humana dizendo "aqui é a Malu" é aceitável,
   ou precisa ser voz sintética? A regra hoje é que a Malu nunca afirma ser uma pessoa.
2. **As imagens novas:** a de preço (R$ 129,90, sem o 12x) e a tabela P a XGG. Posso gerar as duas aqui, no estilo das
   do Drive, se quiser.
3. **Frete do antecipado**, o caminho de 11 de 12 clientes do teste: hoje é cobrado por região no checkout, e a Malu
   não sabe o valor. Frete grátis no antecipado, um valor fixo, ou continua por região?
4. **Depoimentos:** as avaliações (124 com nota 5) e as capturas "Brenda" e "Regina" (2024) são de clientes reais deste
   colete? Se não forem, a imagem 7 sai.
5. **Zíper:** o colete atual tem só colchetes (como diz a base de conhecimento) ou colchetes e zíper (como a foto e o
   vídeo do Drive)?
6. **Custo na Logzz:** a oferta de 1 peça no ar mostra taxa de entrega de **R$ 26,90** e `tax` de R$ 10,35; as de 2 e
   3 peças mostram R$ 19,99 e R$ 0,08. O modelo de margem (R27) conta R$ 19,99 nas três. Se R$ 26,90 for o custo real
   da peça única, a margem do COD de 1 peça cai cerca de R$ 6,40.

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
