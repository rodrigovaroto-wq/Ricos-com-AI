# Teste real — rodada 2026-10-08-operador-pre-rodada

> Arquivado por `pnpm dev:arquivar-teste` em 2026-10-13. CPF, e-mail, CEP e telefone mascarados;
> nome e endereço ficam fora. Os dados brutos (sem identidade) estão no `.json` ao lado.

## Conversas

## Operador (…5983)

- Lead criado: 08/10, 17:03:01 · braço: `{"A":1,"B":0}` · tamanho: G · caminho: — · região com pagamento na entrega: false · pessoa chamada: 08/10, 17:23:37 · opt-out: não

### Conversa e50c80b9 — estágio final `tamanho_definido`

08/10, 17:03:02 **Cliente**: oii

08/10, 17:03:03 **Malu**: Recebemos sua mensagem, em poucos minutos uma de nossas atendentes esclarecerá todas as suas dúvidas. / Enquanto espera, aproveite para entender melhor sobre nosso produto acessando nosso site: / encorpa-fashion.com.br

08/10, 17:04:12 **Malu**: Oii, boa tarde, tudo bem?! Sou a Malu e darei início ao seu atendimento. / Em que posso te ajudar?

  - desfecho `send` — primeira resposta: saudação · reescritas 0 · R$ 0.0008 · v14
08/10, 17:06:02 **Cliente**: vi seu anuncio no ista e queria saber mais sobre a cinta

08/10, 17:06:13 **Cliente**: insta*

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
08/10, 17:06:41 **Malu**: Que bom que você viu por lá, ele é o Colete Cinta Modeladora, que modela a cintura e as costas enquanto você está vestindo e deixa a roupa caindo lisinha / Ele é confortável, não marca embaixo da roupa e ainda dá aquele apoio na postura, o efeito é só enquanto está vestido, tá? / Mas me conta, tem alguma roupa que você ama e deixou de usar porque não se sentiu bem nela?

  - desfecho `send` · reescritas 0 · R$ 0.0076 · v14
08/10, 17:08:16 **Cliente**: aah tem sim, uma blusa linda que ganhei de aniversário da minha mãe

08/10, 17:08:34 **Malu**: Que presente especial, com o colete por baixo a blusa assenta lisinha no corpo e você consegue usar ela se sentindo bem de novo / E pra eu te indicar o tamanho certo, que número de calça você veste e fica confortável?

  - desfecho `send` · reescritas 0 · R$ 0.0058 · v14
08/10, 17:09:41 **Cliente**: uso tamanho 44 de calça

08/10, 17:09:57 **Cliente**: mas é de qualidade essa cinta ai?

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
08/10, 17:10:11 **Cliente**: ja comprei uma, uma vez e era bem ruinzinha

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
08/10, 17:10:34 **Malu**: É sim, o tecido é poliéster com elastano e forro de algodão, lisinho e fininho pra não marcar, e a gente já tem mais de 500 clientes satisfeitas usando / Com 44 de calça o seu é o G, que é pra cintura de 76 a 84 cm / Me passa seu CEP? Aí eu já vejo como fica a entrega e o pagamento aí na sua região

  - desfecho `send` · reescritas 0 · R$ 0.0067 · v14
08/10, 17:12:02 **Cliente**: aah entendi, ok

08/10, 17:12:15 **Malu**: Que bom que fez sentido pra você, e pra gente seguir me diz qual é seu CEP pra eu ver as opções aí pra você?

  - desfecho `send` · reescritas 0 · R$ 0.0059 · v14
08/10, 17:12:19 **Cliente**: teria como me mandar foto dele?

08/10, 17:12:37 **Malu**: Não consigo mandar foto por aqui, mas no site encorpa-fashion.com.br tem o catálogo completo e um vídeo de uma cliente vestindo o colete

  - desfecho `send` · reescritas 0 · R$ 0.0060 · v14
08/10, 17:14:13 **Cliente**: ta bom

08/10, 17:14:21 **Cliente**: meu cep é [cep]

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
  - veto `unattributed_window` (warn): gives a delivery window for one path while offering both, leaving the other blank
08/10, 17:14:40 **Malu**: Aí na sua região a transportadora ainda não tem pagamento na entrega, mas tem o antecipado, que sai com 10% de desconto: R$ 116,91 / No antecipado o frete é calculado por região no checkout, o prazo varia por região, em média 5 dias úteis, e você tem 7 dias após o recebimento pra devolver / Pra deixar o pedido no seu nome, me passa seu nome completo por favor?

  - desfecho `send` · reescritas 0 · R$ 0.0127 · v14
08/10, 17:16:03 **Cliente**: gostei desse descontinho ai em kkkk mas quanto que é o frete?

08/10, 17:16:12 **Cliente**: meu nome é  [nome]

  - desfecho `stopped` — joined: um turno anterior está escrevendo e junta esta mensagem à resposta dele · reescritas 0 · R$ 0.0000 · v14
08/10, 17:16:47 **Malu**: No antecipado o frete é calculado por região, e o valor aparece pra você no checkout, antes de pagar / Para a emissão da nota fiscal, me passa seu CPF por favor?

  - desfecho `send` · reescritas 0 · R$ 0.0128 · v14
08/10, 17:17:40 **Cliente**: [cpf]

08/10, 17:17:52 **Malu**: Perfeito! É só clicar no link do checkout a seguir e concluir sua compra, obrigada por escolher a Encorpa. / https://app.coinzz.com.br/checkout/encorpa-pagamento-antecipado-0?[dados] / Lá você completa o endereço, escolhe o G, confere o frete e paga no pix ou no cartão. Se precisar de alguma ajuda, estarei aqui.

  - desfecho `send` — link — pagamento antecipado | 1 peça | R$ 116,91 pagos antes, no checkout | o prazo varia por região, em média 5 dias úteis | link do checkout do antecipado · reescritas 0 · R$ 0.0009 · v14
08/10, 17:20:59 **Cliente**: ta pedindo meu email lá também, preciso coloca?Nao to conseguindo avançar sem adicionar email

08/10, 17:21:15 **Malu**: É isso mesmo, lá no checkout ele pede o e-mail pra concluir, aí é só colocar o seu que ele libera pra avançar / Qualquer coisa que travar me fala aqui que eu te ajudo

  - desfecho `send` · reescritas 0 · R$ 0.0064 · v14
08/10, 17:22:40 **Cliente**: ok

08/10, 17:22:55 **Malu**: Que bom, aí quando concluir me avisa aqui que eu já fico de olho pra você

  - desfecho `send` · reescritas 0 · R$ 0.0059 · v14
08/10, 17:23:26 **Cliente**: pronto, paguei

08/10, 17:23:38 **Malu**: Vou checar pra você e já te retorno 💛

  - desfecho `handoff` — a cliente pergunta sobre um pedido existente · reescritas 0 · R$ 0.0010 · v14
08/10, 17:24:05 **Cliente**: ta bom

08/10, 17:58:20 **Cliente**: eai??

08/10, 17:58:30 **Cliente**: deu certo meu pagamento?

08/10, 17:58:30 **Cliente**: checou?

  - desfecho `stopped` — superseded: chegou mensagem mais nova dela, e o turno dela responde a rajada inteira · reescritas 0 · R$ 0.0000 · v14
13/10, 16:16:58 **Cliente**: Oii, vi seu anúncio e me interessei pelo produto.


Toques da régua:
- checkout_reminder: canceled · marcado 08/10, 17:32:52
- still_there: canceled · marcado 08/10, 17:36:48
- silence_1: canceled · marcado 08/10, 18:22:55
- silence_2: canceled · marcado 09/10, 09:00:00
- silence_3: canceled · marcado 11/10, 16:03:02

Custo total da Malu: R$ 0.0726

## Análise

Conversa de teste do operador de 08/10, na `turn` v14 — **antes** da rodada de testes reais, arquivada em 13/10 só para
liberar o número (o `handoff_at` de 08/10 é permanente e calava a Malu na v22: a mensagem de 13/10, 19:16, ficou sem resposta).
O handoff veio de "deu certo meu pagamento?" no pós-venda — o caminho que a R21.5 (grafo §86–§88, v20–v22) trocou por ler o pedido
e responder sem pessoa. Nada novo a consertar a partir desta conversa.

## Achados → conserto → guarda

| # | Achado (frase literal) | Causa | Conserto | Guarda | Estado |
|---|---|---|---|---|---|
| 1 | "deu certo meu pagamento?" → "Vou checar pra você e já te retorno 💛" e pessoa chamada | v14 passava pergunta de pedido a uma pessoa | R21.5 (v20–v22): lê o pedido e responde | `tests/r21-post-sale-decisions.test.ts` | ✅ no ar |
| 2 | Número calado em 13/10 | `handoff_at` permanente de 08/10 | lead apagado (`--delete`) com o "pode" do operador | — | ✅ |
| 3 | Arquivo gravava nome digitado e link com nome/CPF | `maskPii` não lia query de link nem "meu nome é" | máscara na raiz (`hermes-core.ts`) + nome do lead (`archive-test-core.ts`) | `tests/archive-test.test.ts` | ✅ |
