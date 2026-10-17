# Teste real — rodada 2026-10-17-zerar-antes-da-campanha

> Arquivado por `pnpm dev:arquivar-teste` em 2026-10-17. CPF, e-mail, CEP e telefone mascarados;
> nome e endereço ficam fora. Os dados brutos (sem identidade) estão no `.json` ao lado.

## Conversas

## Teste_7745 (…7745)

- Lead criado: 06/10, 18:25:53 · braço: `null` · tamanho: M · caminho: — · região com pagamento na entrega: null · pessoa chamada: não · opt-out: não

### Conversa 53f266ca — estágio final `perdido`

06/10, 18:25:55 **Cliente**: oi

06/10, 18:25:55 **Malu**: Oii, tudo bem? / Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas. / Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site: / encorpa-fashion.com.br

06/10, 18:26:12 **Cliente**: tudo sim

06/10, 18:26:31 **Malu**: Que bom que tá tudo bem por aí, eu sou a Malu, da Encorpa e vou te ajudar com carinho. / Tem alguma roupa que você adora e deixou no armário?

  - desfecho `send` · reescritas 0 · R$ 0.0048 · v9
06/10, 18:26:40 **Cliente**: gostaria de comprar mas nao sei escolher o tamanho

06/10, 18:26:59 **Malu**: Que bom que você quer, eu te ajudo a achar o seu tamanho certinho pra roupa cair bem. / Qual número de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0049 · v9
06/10, 18:27:16 **Cliente**: sim

06/10, 18:27:37 **Cliente**: 40

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela antes de a resposta sair; o turno dela responde tudo · reescritas 0 · R$ 0.0048 · v9
06/10, 18:28:20 **Malu**: Pelo que você me contou, o seu é o M, que modela sem apertar. Me passa seu CEP pra eu ver a entrega na sua região?

  - desfecho `send` · reescritas 0 · R$ 0.0052 · v9
06/10, 18:29:30 **Cliente**: [cep]

06/10, 18:29:56 **Malu**: Anotei seu CEP, o checkout confirma a entrega quando você digita ele lá. / Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. / Posso já seguir com seu pedido pra pagar na entrega, me passa seu nome completo?

  - desfecho `send` · reescritas 0 · R$ 0.0052 · v9
06/10, 18:31:02 **Cliente**: desculpa cep antigo

06/10, 18:31:27 **Malu**: https://entrega.logzz.com.br/pay/ccm-1-unidade?[dados] / Lá você completa o endereço e escolhe o dia, e escreve o tamanho M no campo de complemento

  - desfecho `send` — link — pagamento na entrega | 1 peça | R$ 129,90 pagos ao entregador | recebe em 1 a 3 dias, no dia que ela escolhe no checkout | link do checkout da entrega · reescritas 0 · R$ 0.0052 · v9
06/10, 18:31:34 **Cliente**: consegue entregar nesse? [cep]

06/10, 18:31:55 **Malu**: Que bom que me avisou, usa o mesmo link que te mandei com o tamanho M e digita esse CEP novo lá, que o checkout confirma a entrega na hora pra você, tá?

  - desfecho `send` · reescritas 0 · R$ 0.0017 · v9
06/10, 19:05:10 **Malu**: Conseguiu finalizar seu pedido? Se travou em algum passo, é só me falar que eu te ajudo por aqui mesmo 😊

07/10, 09:00:09 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem 7 dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.


Toques da régua:
- checkout_reminder: canceled · marcado 06/10, 18:46:27
- silence_1: sent · marcado 06/10, 19:01:56 · enviado 06/10, 19:05:08
- silence_2: sent · marcado 07/10, 09:00:00 · enviado 07/10, 09:00:08
- silence_3: canceled · marcado 09/10, 17:25:54

Custo total da Malu: R$ 0.0318

## Teste_9393 (…9393)

- Lead criado: 07/10, 09:15:45 · braço: `null` · tamanho: M · caminho: — · região com pagamento na entrega: null · pessoa chamada: não · opt-out: não

### Conversa ed6ba01a — estágio final `perdido`

07/10, 09:15:46 **Cliente**: Boa tarde, tudo bem?

07/10, 09:15:47 **Malu**: Oii, tudo bem? / Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas. / Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site: / encorpa-fashion.com.br

07/10, 09:16:24 **Cliente**: Estou interessada no produto de vocês, que numeração vocês tem disponibilidade?

07/10, 09:17:07 **Malu**: Sou a Malu, da Encorpa, que bom te ver por aqui. / A tabela vai do P ao XGG, pra cintura de 60 até 100 cm, e eu te ajudo a achar o seu certinho. / Tem alguma roupa que você adora e deixou no armário? Me conta qual é?

  - desfecho `send` · reescritas 0 · R$ 0.0058 · v10
07/10, 09:30:09 **Malu**: Ainda está aí?

07/10, 09:36:52 **Cliente**: Hahah tem sim!

07/10, 09:36:55 **Cliente**: Estou

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v10
07/10, 09:37:11 **Malu**: Ai que delícia, conta pra mim qual peça é essa que tá esperando você de volta?

  - desfecho `send` · reescritas 0 · R$ 0.0053 · v10
07/10, 09:50:09 **Malu**: Ainda está aí?

07/10, 10:10:09 **Malu**: Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛

07/10, 11:01:54 **Cliente**: Sim ficaram algumas

07/10, 11:01:59 **Cliente**: A elasticidade é boa?

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v11
07/10, 11:02:09 **Cliente**: Quanto tempo dura essa cinta?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v11
07/10, 11:02:33 **Malu**: Sim, ela é bem elástica, então modela sem apertar e não limita os movimentos, dá pra usar o dia inteiro com conforto. / E sobre durar, cuidando do jeitinho certo ela mantém a elasticidade, que é o que faz o trabalho, então é lavar à mão com água fria e secar na sombra. / E pra eu te indicar o tamanho certo, que tamanho de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0070 · v11
07/10, 11:02:38 **Cliente**: Posso lavar na máquina?

07/10, 11:02:42 **Cliente**: Ou tem que ser lavado a mão?

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v11
07/10, 11:02:52 **Cliente**: Posso colocar na secadora ou perde elasticidade?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v11
07/10, 11:03:10 **Cliente**: Quantas horas por dia eu posso usar?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v11
07/10, 11:03:33 **Malu**: Tem que ser à mão, com água fria e secando na sombra, que é assim que a elasticidade se mantém firme por mais tempo. / Na máquina e na secadora ela solta, e é a elasticidade que modela, então vale cuidar com carinho pra durar bem. / E pode usar o quanto quiser no dia, que ele é preparado pra aguentar o dia inteiro, qual tamanho de calça fica confortável em você?

  - desfecho `send` · reescritas 0 · R$ 0.0116 · v11
07/10, 11:04:33 **Cliente**: Uso 42 mas tenho 33 centímetros de diferença de quadril e cintura, que tamanho você me indica?

07/10, 11:05:28 **Cliente**: Uso 42 mas tenho 33 centímetros de diferença de quadril e cintura, que tamanho você me indica?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v11
07/10, 11:06:09 **Malu**: Com 42 o seu é o G, que é pra cintura de 76 a 84 cm, e ele acompanha bem essa diferença porque modela cintura e quadril juntinhos / Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região

  - desfecho `send` · reescritas 0 · R$ 0.0065 · v11
07/10, 11:07:42 **Cliente**: Sim mas minha cintura tem 68 cm

07/10, 11:07:50 **Cliente**: Meu quadril que é largo

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v11
07/10, 11:08:19 **Malu**: Entendi, com 68cm de cintura o seu é o M, que é pra cintura de 68 a 76 cm, e o tecido elástico acompanha o quadril sem marcar / Qual CEP aí da sua casa pra eu conferir como fica a entrega pra você?

  - desfecho `send` · reescritas 0 · R$ 0.0104 · v11
07/10, 11:20:09 **Malu**: Ainda está aí?

07/10, 11:40:10 **Malu**: Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛

07/10, 12:17:35 **Cliente**: [a cliente mandou um áudio, que você não consegue ouvir]

07/10, 12:18:10 **Malu**: Que bom que você mandou áudio, aqui ele não abriu pra eu ouvir, me conta rapidinho por escrito o que você disse? / E o seu tamanho certinho é o M, de 68 a 76 cm de cintura, me passa seu CEP pra eu ver a entrega aí pra você?

  - desfecho `send` · reescritas 0 · R$ 0.0048 · v11
07/10, 12:30:09 **Malu**: Ainda está aí?

07/10, 12:50:09 **Malu**: Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛

08/10, 09:00:09 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem 7 dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.


Toques da régua:
- still_there: sent · marcado 07/10, 12:28:10 · enviado 07/10, 12:30:08
- silence_1: sent · marcado 07/10, 12:48:10 · enviado 07/10, 12:50:08
- silence_2: sent · marcado 08/10, 09:00:00 · enviado 08/10, 09:00:08
- silence_3: canceled · marcado 10/10, 08:15:45

Custo total da Malu: R$ 0.0513

## Teste_3123 (…3123)

- Lead criado: 09/10, 17:16:11 · braço: `null` · tamanho: — · caminho: — · região com pagamento na entrega: null · pessoa chamada: não · opt-out: não

### Conversa 0a3b51dd — estágio final `perdido`

09/10, 17:16:12 **Cliente**: Quero comprar sinto que o Antônio usa para ir no banheiro feminino

09/10, 17:16:13 **Malu**: Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas. / Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site: / encorpa-fashion.com.br

09/10, 17:17:27 **Malu**: Oii, boa tarde, tudo bem?! Sou a Malu e darei início ao seu atendimento. / Pra eu te deixar no tamanho certo e fechar seu pedido, me diz que número de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0063 · v16
09/10, 17:40:08 **Malu**: Ainda está aí?

09/10, 17:40:30 **Cliente**: nao quero mais, obrigado

09/10, 17:40:46 **Malu**: Sem problemas, estou aqui se tiver mais alguma dúvida 💛 Só te aviso que restam 12 unidades desse lote, então se fizer sentido pra você, vale garantir o seu logo. Pagando na entrega você não paga nada agora, e depois de receber ainda tem 7 dias pra devolver sem custo nenhum. Quando quiser seguir, é só me chamar aqui que eu continuo de onde a gente parou.

  - desfecho `send` — ela vai pensar: resposta fixa e link · reescritas 0 · R$ 0.0011 · v16
09/10, 17:41:30 **Cliente**: nao quero

09/10, 17:41:48 **Malu**: Tudo bem, obrigada por me falar 💛 / Fico por aqui se precisar de algo

  - desfecho `send` · reescritas 0 · R$ 0.0063 · v16
09/10, 18:45:09 **Malu**: Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛

10/10, 09:00:09 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem 7 dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.


Toques da régua:
- still_there: sent · marcado 09/10, 17:37:28 · enviado 09/10, 17:40:08
- silence_1: sent · marcado 09/10, 18:41:49 · enviado 09/10, 18:45:08
- silence_2: sent · marcado 10/10, 09:00:00 · enviado 10/10, 09:00:08
- silence_3: canceled · marcado 12/10, 16:16:11

Custo total da Malu: R$ 0.0138

## Operador (…5983)

- Lead criado: 13/10, 16:46:39 · braço: `{"A":1,"B":0}` · tamanho: G · caminho: cod · região com pagamento na entrega: true · pessoa chamada: não · opt-out: não

### Conversa 1a3ed1a0 — estágio final `link_enviado`

13/10, 16:46:41 **Cliente**: Oii, vi seu anúncio e me interessei pelo produto.

13/10, 16:47:01 **Malu**: Boa tarde, sou a Malu, da Encorpa! / O nosso colete ajuda a roupa a cair melhor, então você volta a se sentir segura com ela. Você pensou em usar com qual peça?

  - desfecho `send` · reescritas 0 · R$ 0.0064 · 25.1 s · v22
13/10, 16:50:19 **Cliente**: Oi Malu, pensei em usar com quase todas as minhas roupas pra falar a verdade kkkk, ganhei uns quilinhos e não to me sentindo bem usando elas...

13/10, 16:50:35 **Malu**: Faz todo sentido, ganhar uns quilinhos mexe mesmo com a gente na frente do espelho. / Ele não promete milagre: modela na hora que você veste, então você já vê a diferença e volta a usar suas favoritas se sentindo bonita de novo. / Que tamanho de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0063 · 20.0 s · v22
13/10, 16:52:32 **Cliente**: Quem dera se fizesse kkk to precisando desse milagre ai

13/10, 16:52:42 **Cliente**: Uso 44

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 6.5 s · v22
13/10, 16:53:04 **Malu**: Ia ser bom mesmo, né? Mas o que ele faz já ajuda muito, deixa tudo mais alinhado e você se olha com mais carinho. / Com 44 de calça o seu é o G, que é pra cintura de 76 a 84 cm. / Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região.

  - desfecho `send` · reescritas 0 · R$ 0.0133 · 17.1 s · v22
13/10, 16:54:20 **Cliente**: Meu cep é [cep]

13/10, 16:54:34 **Malu**: Não consegui consultar esse CEP, parece que não existe. Confere pra mim e me manda de novo?

  - desfecho `send` · reescritas 0 · R$ 0.0065 · 16.7 s · v22
13/10, 16:55:00 **Cliente**: [cep]

13/10, 16:55:04 **Cliente**: Esse ta certo

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 9.4 s · v22
13/10, 16:55:17 **Cliente**: Mas Malu e se não servir, posso pedir pra trocar?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 5.5 s · v22
13/10, 16:55:30 **Cliente**: É seguro mesmo? Nunca vi esse negocio de pagamento na entrega antes

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 6.5 s · v22
  - veto `shipping_promise` (block): promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence
  - veto `delivery_promise` (block): delivery window of 7 days contradicts the configured 1-3
  - veto `unattributed_window` (warn): states a delivery window while offering both paths, without saying which
  - veto `unattributed_window` (warn): states a delivery window while offering both paths, without saying which
  - veto `delivery_promise` (block): delivery window of 7 days contradicts the configured 1-3
13/10, 16:56:36 **Malu**: Com 44 de calça o seu é o G, que é pra cintura de 76 a 84 cm, e pode trocar sim. A garantia é de 7 dias após o recebimento, a troca é sem custo pra você. / É justo desconfiar do novo, e no seu CEP dá pra pagar na entrega, então você tem duas opções. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. / No antecipado o frete é calculado por região no checkout, e você ganha 10% de desconto: R$ 116,91, e o prazo varia por região, em média 5 dias úteis. Na entrega, chega em 1 a 3 dias, no dia que você escolhe. Qual das duas fica melhor pra você?

  - desfecho `send` · reescritas 2 · R$ 0.0247 · 48.3 s · v22
13/10, 16:57:54 **Cliente**: Prefiro o na entrega acho

13/10, 16:57:57 **Cliente**: Mas dai eu nao pago nada agora?

13/10, 16:58:01 **Cliente**: Como funciona isso

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 4.2 s · v22
  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 9.5 s · v22
13/10, 16:58:17 **Malu**: Isso mesmo, você não paga nada agora. Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. / Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega. Quer levar 1 ou 2 peças?

  - desfecho `send` · reescritas 0 · R$ 0.0074 · 19.5 s · v22
13/10, 16:59:45 **Cliente**: 1 mesmo

13/10, 17:00:00 **Cliente**: Mas eu pago pra quem? Nao vem pelo correio?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 13.8 s · v22
13/10, 17:00:28 **Malu**: Você paga direto ao entregador quando receber, não vem pelo correio. Me passa seu nome completo pra deixar o pedido no seu nome?

  - desfecho `send` · reescritas 0 · R$ 0.0086 · 16.7 s · v22
13/10, 17:00:58 **Cliente**: Aah ok entendi

13/10, 17:01:06 **Cliente**: [nome] da [nome]

  - desfecho `stopped` — ok sozinho: sem resposta — ajuda com name em 10 min · reescritas 0 · R$ 0.0000 · 11.6 s · v22
13/10, 17:01:21 **Cliente**: Mas esse entregador fica esperando na minha porta?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 6.8 s · v22
13/10, 17:01:28 **Cliente**: E se eu não estiver em casa no dia?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 5.3 s · v22
13/10, 17:01:57 **Malu**: Ele não espera na porta, você recebe e paga ali na hora, sem provar antes. / Se não tiver ninguém em casa o pedido volta pro centro de distribuição e a entrega não acontece, então vale escolher um dia que você vai estar em casa. / Para a emissão da nota fiscal, me passa seu CPF por favor?

  - desfecho `send` · reescritas 0 · R$ 0.0101 · 17.7 s · v22
13/10, 17:02:40 **Cliente**: [cpf]

13/10, 17:02:53 **Malu**: Pronto, aqui está o seu link 💛 / https://entrega.logzz.com.br/pay/ccm-1-unidade?[dados] / Lá você completa o endereço, escolhe o G e o dia da entrega. Se precisar de alguma ajuda, estarei aqui.

  - desfecho `send` — link — pagamento na entrega | 1 peça | R$ 129,90 pagos ao entregador | recebe em 1 a 3 dias, no dia que ela escolhe no checkout | link do checkout da entrega · reescritas 0 · R$ 0.0010 · 15.1 s · v22
13/10, 17:03:38 **Cliente**: Ok

13/10, 17:03:54 **Malu**: Qualquer dúvida no checkout me chama que te ajudo

  - desfecho `send` · reescritas 0 · R$ 0.0016 · 18.3 s · v22
13/10, 17:05:45 **Cliente**: Nao consigo selecionar um horário de recebimento?

13/10, 17:06:02 **Malu**: Você escolhe o dia no checkout, o horário não dá pra escolher porque chega ao longo do dia

  - desfecho `send` · reescritas 0 · R$ 0.0019 · 20.8 s · v22
13/10, 17:06:08 **Cliente**: Eu trabalho nos dias que está me dando ali, posso não estar em casa quando o pedido chegar

13/10, 17:06:24 **Malu**: Pode sim, sem problemas, outra pessoa pode receber e pagar por você nesse dia. / Se preferir receber você mesma, vale escolher o dia em que você vai estar em casa, que fica mais tranquilo pra você

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 18.2 s · v22
13/10, 17:06:26 **Cliente**: Mas dai como que faz

13/10, 17:06:37 **Cliente**: Nao sei se vou estar em casa no horario que o entregador chegar

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 5.4 s · v22
13/10, 17:06:50 **Cliente**: Mas eu moro sozinha moça, nao tenho quem receber por mim

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 4.4 s · v22
13/10, 17:07:01 **Malu**: Vou checar pra você e já te retorno 💛

  - desfecho `handoff` — a cliente pergunta sobre um pedido existente · reescritas 0 · R$ 0.0146 · 8.8 s · v22
13/10, 17:07:21 **Cliente**: Ent  mas nao ta dando para escolher outro dia se nao um dos proximos 3

16/10, 22:10:23 **Cliente**: oi[

16/10, 22:10:47 **Malu**: Você escolhe um desses próximos 3 dias ali no checkout, porque na entrega o prazo é de 1 a 3 dias. / Se nesses dias você trabalha fora o dia todo, vale escolher o que você consegue estar em casa nem que seja por parte do dia

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 27.2 s · v26
16/10, 22:12:01 **Malu**: ola, tudo bem?

16/10, 22:12:06 **Malu**: teste

16/10, 23:15:12 **Malu**: Qualquer coisa é só chamar! Lembrando que você não paga nada agora — o pagamento é só quando o colete chegar na sua mão.

16/10, 23:15:13 **Malu**: Posso te mandar ofertas da Encorpa por aqui?

16/10, 23:16:09 **Cliente**: Quero ofertas

  - veto `shipping_promise` (block): promises free shipping outside the one sentence cash on delivery allows: say it as "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber.", in a sentence of its own with nothing else in it, and never next to a sentence
  - veto `price_promise` (block): price R$ 311,76 belongs to another offer than the one this sentence names; say each offer in its own sentence | rascunho vetado: Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega, e 3 peças sai com 20%: R$ 311,76 na entrega.

Q
16/10, 23:16:42 **Malu**: Levando 2 peças o desconto sobe para 10%: R$ 233,82 na entrega. / Levando 3 peças o desconto sobe para 20%: R$ 311,76 na entrega. / Quer 1, 2 ou 3 peças?

  - desfecho `send` · reescritas 2 · R$ 0.0203 · 35.5 s · v27

Toques da régua:
- checkout_reminder: canceled · marcado 13/10, 17:12:53
- silence_3: canceled · marcado 16/10, 15:46:40
- silence_1: sent · marcado 16/10, 23:10:47 · enviado 16/10, 23:15:12
- still_there: scheduled · marcado 16/10, 23:36:42
- silence_2: scheduled · marcado 17/10, 09:00:00

Custo total da Malu: R$ 0.1363

## Testador_7967 (…7967)

- Lead criado: 13/10, 17:12:09 · braço: `{"A":1,"B":1}` · tamanho: P · caminho: prepay · região com pagamento na entrega: true · pessoa chamada: não · opt-out: não

### Conversa c9aabb22 — estágio final `caminho_escolhido`

13/10, 17:12:10 **Cliente**: Oi tudo bem?

13/10, 17:12:15 **Cliente**: Queria saber mais sobre a cinta

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 9.2 s · v22
13/10, 17:12:28 **Malu**: Boa tarde, eu sou a Malu, da Encorpa / O nosso colete modela o abdômen e as costas na hora que você veste, que é pra roupa cair melhor e você se sentir segura de novo. Tem alguma peça que você ama e anda deixando no armário?

  - desfecho `send` · reescritas 0 · R$ 0.0016 · 15.7 s · v22
13/10, 17:15:39 **Cliente**: Na vdd queria saber o tamanho msm

13/10, 17:15:42 **Cliente**: Uso calca 34

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 8.2 s · v22
13/10, 17:15:55 **Malu**: Com 34 de calça o seu é o P, que é pra cintura de 60 a 68 cm / Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região

  - desfecho `send` · reescritas 0 · R$ 0.0065 · 15.5 s · v22
13/10, 17:16:47 **Cliente**: Pfto

13/10, 17:16:53 **Cliente**: [cep]

13/10, 17:16:55 **Cliente**: Queria pagar no pix

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · 5.7 s · v22
  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · 5.6 s · v22
13/10, 17:17:13 **Malu**: Antes do link, uma dica: levando mais peças o desconto sobe 💛 / Com 2 peças fica R$ 207,84, 20% de desconto. / Com 3 peças fica R$ 272,79, 30% de desconto. / Quer de 2, de 3 ou só uma peça?

  - desfecho `send` — braço B: oferta fixa do kit antes do link · reescritas 0 · R$ 0.0079 · 9.0 s · v22
13/10, 17:17:41 **Cliente**: Conseguem parcelar ou fazer por 100 reais descontinho no pix? Levando so uma mesmo?

  - veto `price_promise` (block): price 100 is not one of the configured values
  - veto `installment_promise` (block): extends installments beyond the prepaid card checkout
  - veto `installment_promise` (block): extends installments beyond the prepaid card checkout
  - veto `installment_promise` (block): extends installments beyond the prepaid card checkout
13/10, 17:18:19 **Malu**: Deixa eu confirmar isso certinho pra você e já te respondo por aqui 💛

  - desfecho `handoff` — nenhuma reescrita passou: 2 reescrita(s) e nenhuma passou na cadeia: extends installments beyond the prepaid card checkout · reescritas 2 · R$ 0.0194 · 40.1 s · v22
13/10, 17:20:16 **Cliente**: Eae?

13/10, 17:23:36 **Cliente**: Malu?


Toques da régua:
- still_there: canceled · marcado 13/10, 17:37:14
- silence_1: canceled · marcado 13/10, 18:17:14
- silence_2: canceled · marcado 14/10, 09:00:00
- silence_3: canceled · marcado 16/10, 16:12:10

Custo total da Malu: R$ 0.0354

## Testador_3720 (…3720)

- Lead criado: 13/10, 21:22:28 · braço: `{"A":0,"B":0}` · tamanho: M · caminho: prepay · região com pagamento na entrega: true · pessoa chamada: não · opt-out: não

### Conversa 86eb58cb — estágio final `caminho_escolhido`

13/10, 21:22:29 **Cliente**: Oi, quanto custa?

13/10, 21:22:30 **Malu**: Recebi sua mensagem, já te respondo por aqui 💛

13/10, 21:23:42 **Malu**: Boa noite, eu sou a Malu, da Encorpa! Ele sai de R$ 216,50 por R$ 129,90 pagando na entrega, e no antecipado tem 10% de desconto. / Me passa seu CEP pra eu ver como fica a entrega e o pagamento aí na sua região?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 12.3 s · v22
13/10, 21:24:30 **Cliente**: [cep]

13/10, 21:24:44 **Malu**: Não consegui consultar esse CEP porque ele não existe, confere pra mim e manda de novo?

  - desfecho `send` · reescritas 0 · R$ 0.0062 · 17.9 s · v22
13/10, 21:26:09 **Cliente**: [cep]

13/10, 21:26:24 **Malu**: No seu CEP dá pra pagar na entrega, então você tem duas opções. / Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber. Na entrega, chega em 1 a 3 dias, no dia que você escolhe. / No antecipado o frete é calculado por região no checkout, você ganha 10% de desconto, R$ 116,91, e o prazo varia por região, em média 5 dias úteis. Qual das duas fica melhor pra você?

  - desfecho `send` · reescritas 0 · R$ 0.0065 · 18.0 s · v22
13/10, 21:26:52 **Cliente**: Quero pagar agora

13/10, 21:27:12 **Malu**: Pode ser no antecipado sim, sem problema! Que número de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0064 · 23.7 s · v22
13/10, 21:27:57 **Cliente**: Tamanho 40

13/10, 21:28:13 **Malu**: Com 40 de calça o seu é o M, que é pra cintura de 68 a 76 cm. / Levando 2 peças o desconto sobe para 20%: R$ 207,84 no antecipado, e 3 peças sai por R$ 272,79. Quer levar 1 ou aproveitar com 2?

  - desfecho `send` · reescritas 0 · R$ 0.0067 · 18.8 s · v22
13/10, 21:29:00 **Cliente**: Você é robô?

13/10, 21:29:15 **Malu**: Não sou uma pessoa, sou a assistente virtual da marca e sigo te ajudando por aqui! / Quer levar 1 peça ou aproveitar com 2 no antecipado?

  - desfecho `send` · reescritas 0 · R$ 0.0065 · 18.8 s · v22
13/10, 21:30:12 **Cliente**: Você é IA?

13/10, 21:30:32 **Malu**: Não sou uma pessoa, sou a assistente virtual da marca e continuo aqui com você! / Você prefere levar 1 peça ou aproveitar com 2 no antecipado?

  - desfecho `send` · reescritas 0 · R$ 0.0065 · 22.7 s · v22
13/10, 21:31:55 **Cliente**: Qual é o seu nome mesmo?

13/10, 21:32:10 **Malu**: Sou a Malu, da Encorpa! Seguimos com 1 ou 2 peças?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 18.7 s · v22
13/10, 21:33:10 **Cliente**: Quero 6 peças

13/10, 21:33:23 **Malu**: Pra levar 6 peças eu chamo uma pessoa do time pra montar seu pedido 💛

  - desfecho `handoff` — a cliente quer 6 peças, mais que o maior kit (3) · reescritas 0 · R$ 0.0009 · 15.3 s · v22
13/10, 21:34:08 **Cliente**: Vou pensar


Toques da régua:
- still_there: canceled · marcado 13/10, 21:52:11
- silence_1: canceled · marcado 13/10, 22:32:11
- silence_2: canceled · marcado 14/10, 09:00:00
- silence_3: canceled · marcado 16/10, 20:22:29

Custo total da Malu: R$ 0.0531

## Testador_1632 (…1632)

- Lead criado: 13/10, 21:35:38 · braço: `{"A":1,"B":0}` · tamanho: — · caminho: — · região com pagamento na entrega: null · pessoa chamada: não · opt-out: não

### Conversa 89708a09 — estágio final `perdido`

13/10, 21:35:39 **Cliente**: Oi tudo bem? O que exatamente você vende?

13/10, 21:36:00 **Malu**: Boa noite, eu sou a Malu, da Encorpa e a gente vende o nosso colete cinta, que modela na hora que você veste e a roupa cai melhor / Tem alguma peça que você ama e anda deixando no armário porque não se sentiu bem nela?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 24.2 s · v22
13/10, 21:36:40 **Cliente**: Com certeza tenho. Engordei e não consigo usar algumas roupas

13/10, 21:36:55 **Malu**: Faz todo sentido, e acontece com muita gente, o corpo muda e a roupa que a gente gosta fica parada / O nosso colete pega o abdômen e as costas por completo, fica liso por baixo da roupa e você volta a se sentir segura com as suas favoritas / O que mais te incomoda quando você prova essas roupas hoje?

  - desfecho `send` · reescritas 0 · R$ 0.0064 · 17.7 s · v22
13/10, 21:57:46 **Cliente**: Estou pesando 200kg. O que eu faço?

13/10, 21:58:04 **Malu**: Entendo, e que bom que você me contou, assim eu te oriento do jeito certo pra você não comprar algo que não sirva / O nosso colete vai do P ao XGG, que é pra cintura de 92 a 100 cm, então ele não atende todos os corpos / Que tamanho de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 20.8 s · v22
13/10, 21:58:37 **Cliente**: Tamanho 65

13/10, 21:58:58 **Malu**: Pelo que você me contou, o nosso colete não vai te vestir bem, e eu não quero que você compre algo que não sirva

  - desfecho `send` · reescritas 0 · R$ 0.0069 · 23.1 s · v22
13/10, 23:00:12 **Malu**: Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛

13/10, 23:00:12 **Malu**: Posso te mandar lembretes e ofertas da Encorpa por aqui?

14/10, 09:00:19 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. O colete chega na sua casa, você vê e só paga ao entregador na hora — se não for o que você esperava, não fica com ele. E depois de receber, ainda tem 7 dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.


Toques da régua:
- still_there: canceled · marcado 13/10, 22:18:04
- silence_1: sent · marcado 13/10, 22:58:58 · enviado 13/10, 23:00:10
- silence_2: sent · marcado 14/10, 09:00:00 · enviado 14/10, 09:00:13
- silence_3: canceled · marcado 16/10, 20:35:39

Custo total da Malu: R$ 0.0265

## Irmã_6682 (…6682)

- Lead criado: 14/10, 13:27:03 · braço: `{"A":0,"B":0}` · tamanho: — · caminho: — · região com pagamento na entrega: null · pessoa chamada: não · opt-out: não

### Conversa c929c01b — estágio final `conversando`

14/10, 13:27:04 **Cliente**: Oi

14/10, 13:27:05 **Malu**: Recebi sua mensagem, já te respondo por aqui 💛

14/10, 13:27:30 **Cliente**: Que isso

14/10, 13:27:45 **Malu**: Boa tarde, sou a Malu, da Encorpa! / Vi seu oi por aqui, você veio pelo anúncio do nosso colete, né?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 18.5 s · v22
14/10, 13:28:07 **Cliente**: Oque você faz

14/10, 13:28:28 **Malu**: Eu te ajudo com o nosso colete por aqui, do tamanho ao pedido. Qual roupa você queria voltar a usar?

  - desfecho `send` · reescritas 0 · R$ 0.0066 · 24.4 s · v22
14/10, 13:29:15 **Cliente**: Que colete e esse

14/10, 13:29:30 **Malu**: É o nosso Colete Cinta Modeladora, que modela na hora que você veste e deixa a roupa caindo alinhada, além de ajudar na postura / Ele é liso e fininho por baixo da roupa, com forro de algodão e só em preto por enquanto. O que te incomoda na hora de se vestir hoje?

  - desfecho `send` · reescritas 0 · R$ 0.0064 · 17.0 s · v22
14/10, 13:50:08 **Malu**: Ainda está aí?

14/10, 14:30:09 **Malu**: Oi! Ficou alguma dúvida sobre o colete? Se quiser, me diz que tamanho de calça você usa que eu já te falo o certinho pra você 💛

14/10, 14:30:10 **Malu**: Posso te mandar lembretes e ofertas da Encorpa por aqui?

14/10, 14:32:13 **Cliente**: Não, obrigada

14/10, 14:32:29 **Malu**: Sem problemas, não mando mais nada, e sigo por aqui se precisar 💛

  - desfecho `send` · reescritas 0 · R$ 0.0065 · 20.8 s · v22
15/10, 09:00:25 **Malu**: Bom dia! 💛 Passando só pra dizer uma coisa que talvez tenha ficado na sua cabeça ontem: você não precisa decidir confiando na gente. Dependendo da sua região, dá pra pagar só quando o colete chegar na sua mão, e depois de receber você ainda tem 7 dias pra devolver, sem custo nenhum pra você. Se ainda fizer sentido pra você, é só me chamar.


Toques da régua:
- still_there: sent · marcado 14/10, 13:49:30 · enviado 14/10, 13:50:07
- silence_1: sent · marcado 14/10, 14:29:30 · enviado 14/10, 14:30:08
- silence_2: sent · marcado 15/10, 09:00:00 · enviado 15/10, 09:00:22
- silence_3: scheduled · marcado 17/10, 12:27:04

Custo total da Malu: R$ 0.0261

## Análise

_Preenchida depois de ler as conversas, pelo roteiro de `docs/operacao/auditar-conversa-real.md` §3._

## Achados → conserto → guarda

| # | Achado (frase literal) | Causa | Conserto | Guarda | Estado |
|---|---|---|---|---|---|
