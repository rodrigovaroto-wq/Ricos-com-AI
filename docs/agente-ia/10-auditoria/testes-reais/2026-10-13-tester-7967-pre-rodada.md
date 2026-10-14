# Teste real — rodada 2026-10-13-tester-7967-pre-rodada

> Arquivado por `pnpm dev:arquivar-teste` em 2026-10-13. CPF, e-mail, CEP e telefone mascarados;
> nome e endereço ficam fora. Os dados brutos (sem identidade) estão no `.json` ao lado.

## Conversas

## Testador (…7967)

- Lead criado: 08/10, 18:07:27 · braço: `{"A":1,"B":1}` · tamanho: P · caminho: prepay · região com pagamento na entrega: true · pessoa chamada: não · opt-out: não

### Conversa dda6231f — estágio final `caminho_escolhido`

08/10, 18:07:28 **Cliente**: Oi tudo bem

08/10, 18:07:29 **Malu**: Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas. / Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site: / encorpa-fashion.com.br

08/10, 18:08:43 **Malu**: Oii, boa tarde, tudo bem?! Sou a Malu e darei início ao seu atendimento. / Em que posso te ajudar?

  - desfecho `send` — primeira resposta: saudação · reescritas 0 · R$ 0.0008 · v14
08/10, 18:09:19 **Cliente**: Oi tudo bem? Estou com duvida no tamanho e queria entender melhor esse negocio de pagamento na entrega

  - veto `shipping_promise` (block): promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence
08/10, 18:09:56 **Malu**: Que bom que perguntou, te explico os dois com calma, e pra te indicar o tamanho certo, que número de calça você veste e fica confortável? / No pagamento na entrega você não paga nada agora e paga ao entregador quando o colete chegar na sua mão, do jeito que preferir. / Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.

  - desfecho `send` · reescritas 1 · R$ 0.0114 · v14
08/10, 18:12:57 **Cliente**: 42

08/10, 18:13:14 **Malu**: Com 42 de calça o seu é o G, que é pra cintura de 76 a 84 cm, e ele modela abdômen e costas por completo. / Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região.

  - desfecho `send` · reescritas 0 · R$ 0.0059 · v14
08/10, 18:15:02 **Cliente**: Perfeito,! Aceita pix ne? Ele toca campainha?

08/10, 18:15:06 **Cliente**: [cep]

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v14
  - veto `unattributed_window` (warn): gives a delivery window for one path while offering both, leaving the other blank
08/10, 18:15:36 **Malu**: Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado que aceita pix sim, e sai com 10% de desconto: R$ 116,91. / A entrega chega no seu endereço normalmente e toca sim, e no antecipado o frete é calculado por região no checkout, o prazo varia por região, em média 5 dias úteis, e você tem 7 dias após o recebimento pra devolver. / Me passa seu nome completo pra eu deixar o pedido no seu nome por favor?

  - desfecho `send` · reescritas 0 · R$ 0.0068 · v14
08/10, 18:20:46 **Cliente**: Perguntei se aceita pix na entrega, quando chegar a cinta

08/10, 18:21:02 **Cliente**: [nome] [nome] [nome]

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
08/10, 18:21:22 **Malu**: Não aceita, porque aí no seu CEP não tem pagamento quando chega, vai só no antecipado mesmo, e aí você paga antes no checkout no pix ou no cartão. / Obrigada, [nome], já deixo aqui no seu nome, que é R$ 116,91 com 10% de desconto, e o frete é calculado por região no checkout. / Para a emissão da nota fiscal, me passa seu CPF por favor?

  - desfecho `send` · reescritas 0 · R$ 0.0119 · v14
08/10, 18:22:34 **Cliente**: [cpf]

08/10, 18:22:47 **Cliente**: Mas nao entendi, quero pagar na entrega entao, pode ser no cartao porem na entrega?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
08/10, 18:23:50 **Malu**: Como aí no seu CEP não tem pagamento quando chega, vai só no antecipado com o pix ou o cartão pagos antes no checkout, e o que você me passou já vai preenchido, lá você completa o endereço e escolhe o G / https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?[dados]

  - desfecho `send` — link — pagamento antecipado | 1 peça | R$ 116,91 pagos antes, no checkout | o prazo varia por região, em média 5 dias úteis | link do checkout do antecipado · reescritas 0 · R$ 0.0064 · v14
08/10, 18:26:09 **Cliente**: [áudio da cliente, transcrito automaticamente — pode ter erro de transcrição] Vou finalizar o pagamento aqui te aviso, obrigado malu

08/10, 18:26:39 **Malu**: Que ótimo, [nome], finaliza com calma que já está tudo certinho pra você, e me avisa quando concluir que eu acompanho daqui

  - desfecho `send` · reescritas 0 · R$ 0.0065 · v14
08/10, 19:30:09 **Malu**: Conseguiu finalizar seu pedido? Se travou em algum passo, é só me falar que eu te ajudo por aqui mesmo 😊

09/10, 09:00:09 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: comprar sem ver dá um frio na barriga, eu sei. Então fica tranquila: depois que o colete chega na sua casa, você tem 7 dias pra devolver se não for o que você esperava, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.

09/10, 22:54:40 **Cliente**: Malu, me recomebda 3 cintrabaixos para metal

09/10, 22:54:43 **Cliente**: Quero comprar pra tocar sepultura

09/10, 22:54:45 **Cliente**: Curte?

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v16
  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v16
09/10, 22:55:09 **Malu**: Entendo, mas por aqui eu só consigo te ajudar com o nosso colete cinta modeladora, que é o que a gente vende. / De contrabaixo pra metal eu não entendo nada pra te indicar bem, então prefiro não chutar. / Se quiser voltar pro pedido do colete G, me fala que eu te ajudo a finalizar, tá?

  - desfecho `send` · reescritas 0 · R$ 0.0069 · v16
09/10, 22:56:18 **Cliente**: E vc malu mora na ZS chacara flora

09/10, 22:56:22 **Cliente**: [a cliente mandou uma figurinha]

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v16
09/10, 22:56:42 **Cliente**: [a cliente mandou uma imagem, descrita automaticamente — pode ter erro: Uma pessoa de camiseta branca sentada à mesa, com uma mão no rosto e um celular na outra. Ao fundo há grades brancas e sobre a mesa uma lata.]

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v16
  - veto `shipping_promise` (block): promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence
09/10, 22:57:31 **Malu**: Eu atendo por aqui mesmo, a nossa venda é só online e o colete vai direto pra sua casa. / Vi sua foto aqui na mesa, me conta o que você quis me mostrar?

  - desfecho `send` · reescritas 1 · R$ 0.0210 · v16
09/10, 23:04:03 **Cliente**: O Kas

09/10, 23:04:25 **Malu**: Você quis dizer o Kas da foto, o que tem na mesa? / Me conta um pouquinho mais o que você quer saber que eu te ajudo?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · v16
09/10, 23:25:09 **Malu**: Ainda está aí?

  - veto `business_hours` (block): agent reply outside the 6:00-24:00 window
10/10, 07:00:09 **Malu**: Qualquer coisa é só chamar! Lembrando que você não paga nada agora — o pagamento é só quando o colete chegar na sua mão.

10/10, 22:05:09 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem 7 dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.

13/10, 16:23:05 **Cliente**: Oi

13/10, 16:23:10 **Cliente**: Vi o anuncio e queria tirar uma duvida

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 9.1 s · v22
13/10, 16:23:26 **Malu**: Oi, eu sou a Malu, da Encorpa! Pode mandar sua dúvida que te ajudo já?

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 20.6 s · v22
13/10, 16:25:29 **Cliente**: Queria saber sobre o produto e tamanho, peso 52 e uso 36 de calca

13/10, 16:25:51 **Malu**: O nosso colete modela o abdômen e as costas na hora que você veste, então a roupa cai melhor e você se sente segura de novo, além de ajudar na postura. / Ele é de poliéster com elastano, com forro de algodão e sem barbatana nenhuma, então fica liso por baixo da roupa. / Com 36 de calça a gente acha o seu certinho, você pensou em usar com qual peça?

  - desfecho `send` · reescritas 0 · R$ 0.0072 · 25.9 s · v22
13/10, 16:27:23 **Cliente**: Com regata ou algo assim mais casual pro / Dia a dia

13/10, 16:27:43 **Malu**: Dá super pra usar com regata no dia a dia, ele é fininho e fica liso por baixo, sem marcar. E pelo que você me passou o seu é o XGG, pra cintura de 92 a 100 cm. / No seu CEP dá pra pagar na entrega, então você tem duas opções. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. Na entrega, chega em 1 a 3 dias, no dia que você escolhe. / No antecipado o frete é calculado por região no checkout, você ganha 10% de desconto, R$ 116,91, e o prazo varia por região, em média 5 dias úteis. Qual das duas fica melhor pra você?

  - desfecho `send` · reescritas 0 · R$ 0.0074 · 23.3 s · v22
13/10, 16:36:45 **Cliente**: Meu tamanho de calca eh 36 certeza q seria XGG?

13/10, 16:37:00 **Malu**: É o P sim, pra cintura de 60 a 68 cm, que é o que veste o 36 que você usa e fica confortável. / Desculpa o erro ali em cima, o certo pra você é o P, tá? / Qual das duas fica melhor pra você, pagar na entrega ou no antecipado?

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 19.0 s · v22
13/10, 16:39:34 **Cliente**: Queria pagar no pix

13/10, 16:39:41 **Cliente**: Tem desconto em algum no pix?

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 8.9 s · v22
13/10, 16:39:57 **Malu**: No pix tem 10% sim, e levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado, 3 peças R$ 272,79, quer levar 2 ou 3?

  - desfecho `send` · reescritas 0 · R$ 0.0073 · 19.7 s · v22
13/10, 16:44:01 **Cliente**: Por favor consegue me gerar o pagamento? Vou levar so 1

13/10, 16:44:23 **Malu**: Você paga R$ 116,91 no pix, no checkout, e o frete é calculado por região e aparece antes de pagar. O prazo varia por região, em média 5 dias úteis. / Usa o link que te mandei aqui, lá você escolhe o P e completa seu endereço.

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 25.7 s · v22
13/10, 16:46:39 **Cliente**: Qual?

13/10, 16:46:59 **Malu**: É o link que mandei logo acima, lá você escolhe o P

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 24.6 s · v22
13/10, 16:47:03 **Cliente**: N recebi link

13/10, 16:47:25 **Malu**: Tá aqui em cima na conversa, chega rapidinho aí pra você abrir e escolher o P?

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 25.1 s · v22
13/10, 16:47:31 **Cliente**: Nao tem LINK

13/10, 16:47:50 **Malu**: Que estranho, era pra estar aqui na conversa, consegue rolar um pouquinho pra cima?

  - desfecho `send` · reescritas 0 · R$ 0.0068 · 22.7 s · v22
13/10, 16:48:17 **Cliente**: Nao tem link moça

13/10, 16:48:40 **Malu**: Você consegue sair e entrar de novo no zap? O link do pedido tá aqui na conversa pra abrir e escolher o P

  - desfecho `send` · reescritas 0 · R$ 0.0070 · 25.3 s · v22
13/10, 16:53:40 **Cliente**: Consegue gerar um novo link?

13/10, 16:53:43 **Cliente**: Por favor

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 8.9 s · v22
13/10, 16:54:05 **Malu**: Poxa, aqui aparece como enviado, quer que alguém do time te chame pra ajudar?

  - desfecho `send` · reescritas 0 · R$ 0.0071 · 25.9 s · v22
13/10, 16:55:24 **Cliente**: Correto, paguei aqui encontrei ele na conversa

13/10, 16:55:31 **Cliente**: Chega quando?

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 9.1 s · v22
13/10, 16:55:38 **Malu**: Conferi aqui e o seu pagamento ainda não aparece como confirmado. Às vezes leva alguns minutinhos pra atualizar, aguarda um pouquinho que eu fico de olho e te aviso 💛

13/10, 16:56:19 **Cliente**: Queria comprar mais um, queria saber se vcs parcelam, e conseguem fazer um descontinho, fazer por 100 reais

  - veto `price_promise` (block): price 100 is not one of the configured values
13/10, 16:56:53 **Malu**: No antecipado no cartão dá pra parcelar em até 12x, e as condições aparecem no checkout antes de pagar. / Por esse valor eu não consigo, 1 peça no antecipado é R$ 116,91 com 10% de desconto e eu não tenho como mexer nesse preço. / Quer que alguém do time te chame pra te ajudar com esse segundo pedido?

  - desfecho `send` · reescritas 1 · R$ 0.0132 · 36.9 s · v22
13/10, 17:01:52 **Cliente**: Nao precisa

13/10, 17:01:57 **Cliente**: Paguei ja 116

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 7.4 s · v22
13/10, 17:02:03 **Cliente**: Queria saber quando chega meu pedido

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 4.1 s · v22
13/10, 17:02:10 **Malu**: Conferi aqui e o seu pagamento ainda não aparece como confirmado. Às vezes leva alguns minutinhos pra atualizar, aguarda um pouquinho que eu fico de olho e te aviso 💛

13/10, 17:02:36 **Cliente**: Quero sim, por favor chame

13/10, 17:03:00 **Malu**: Tá bom, sigo aqui com você acompanhando o pagamento e a entrega, qualquer novidade te falo por aqui

  - desfecho `send` · reescritas 0 · R$ 0.0070 · 26.3 s · v22

Toques da régua:
- checkout_reminder: canceled · marcado 08/10, 18:38:50
- silence_3: canceled · marcado 11/10, 17:07:27
- still_there: canceled · marcado 13/10, 17:16:53 · enviado 09/10, 23:25:08
- silence_1: scheduled · marcado 13/10, 18:03:01 · enviado 10/10, 07:00:08
- silence_2: scheduled · marcado 14/10, 09:00:00 · enviado 10/10, 22:05:08

Custo total da Malu: R$ 0.1816

## Análise

Número de teste com histórico desde 08/10 (v14–v16) reusado em 13/10 na v22, antes da rodada. O operador pediu para apagar
porque o histórico atrapalhava; arquivado antes, com os achados abaixo para consertar depois da rodada. A conversa de 13/10
(16:23–17:03, horário de SP) mostra o estado antigo vazando para a conversa nova (tamanho e link de 08/10) e três achados que não
dependem do histórico.

## Achados → conserto → guarda

| # | Achado (frase literal) | Causa | Conserto | Guarda | Estado |
|---|---|---|---|---|---|
| 1 | "pelo que você me passou o seu é o XGG" a quem disse "uso 36" (depois corrigido para P) | provável: tamanho de 08/10 guardado no lead sobrepôs o "36" novo | **causa real (14/10):** não era dado velho — "tamanho, peso 52" era lido como calça 52; `WEIGHT_CUE` em `extractDressSize` | `tests/r23-round2-fixes.test.ts`, mutação `R23-peso-nao-e-tamanho` | ✅ R23 |
| 2 | "Usa o link que te mandei aqui" — nenhum link novo foi mandado; ela não achou, a Malu insistiu 4 vezes ("rolar pra cima", "sair e entrar no zap") | provável: estágio/link de 08/10 tomado como enviado; pedido de "novo link" não reenvia | `asksForLink` lê "N recebi link", "Nao tem LINK", "gerar um novo link/pagamento" → o link sai de novo | `tests/r23-round2-fixes.test.ts`, mutação `R23-link-de-novo` | ✅ R23 |
| 3 | "quer que alguém do time te chame pra ajudar?" | a Malu oferece pessoa sem pedido (contra R21.1) | `humanity_claim` veta a oferta; prompt e briefings deixam de ensiná-la (R22.1) | `tests/r22-no-person.test.ts`, mutação `R22-oferta-pessoa` | ✅ R22 |
| 4 | "Quero sim, por favor chame" → "sigo aqui com você…" | o "sim" à oferta de pessoa não conta como pedido explícito | sem oferta (R22.1), não há "sim" a ler | — | ✅ R22 |
| 5 | "Chega quando?" / "Queria saber quando chega meu pedido" sem resposta de prazo | a resposta fixa de pagamento pendente engole a pergunta de prazo | `paidDeadlineLine` junto da linha de pagamento | `tests/r23-round2-fixes.test.ts`, mutação `R23-paguei-prazo` | ✅ R23 |
| 6 | "Paguei ja 116" e pagamento não confirmado | provável: pagou pelo link antigo de 08/10 (outro pedido) | conferir na Coinzz antes de apagar mais nada | — | ⬜ aberto |
