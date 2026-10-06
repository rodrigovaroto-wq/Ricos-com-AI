# Changelog do system prompt

O prompt é `src/agent/prompt.ts`, espelhado byte a byte em
`supabase/functions/turn/prompt.ts`. As versões anteriores a esta estão só no histórico do
Git desse arquivo (`git log -- src/agent/prompt.ts`). Toda entrada daqui para a frente diz o
que foi **medido**, e diz quando nada foi medido.

### 2026-10-06 — conversa de venda v2: duas opções, dados antes do link, fatos do colete

- **Mudou (várias coisas juntas, a pedido do operador; o efeito de cada uma não é atribuível):**
  1. **C1:** saíram "Uma oferta só… não pergunte qual ela prefere" e "O pagamento antecipado é
     uma SAÍDA, não uma opção". Entrou o bloco `PAGAMENTO`. Onde o pagamento na entrega existe
     para o CEP, ela recebe as duas opções em três balões (`twoOptionsMessage`, tudo lido do
     config) e escolhe. Onde não existe, só o antecipado, com o motivo do script 02 §7.2
     (`noCodMessage`). O "sim" sem escolha vira entrega confirmada (`DEFAULT_COD_CONFIRM`) **só**
     onde a entrega existe; fora dela, o "sim" é o antecipado. O fechamento por escolha agora
     é "Qual das duas fica melhor pra você?".
  2. **C2:** saíram "mande o link e NÃO peça nome, e-mail nem CPF antes" e "o link primeiro,
     nunca o CPF primeiro". Entrou `OS DADOS E O LINK`: tamanho, CEP, nome completo, e-mail e
     CPF antes do link, um por mensagem e com o motivo. CPF recusado duas vezes faz o link ir
     sem ele. Para e-mail recusado ela não insiste, e saiu "o checkout pede o e-mail lá": a Logzz
     não tem o campo.
  3. **C10:** saiu "escrever os tamanhos no complemento" (kits). No checkout ela escolhe o
     tamanho ("lá você escolhe o M").
  4. **C7:** o "vou pensar" deixou de dizer "o link vai junto automaticamente" e passou a dizer
     "não escreva link nenhum".
  5. **Público ainda não convencido**, mais `O CAMINHO DA CONVERSA` (arco do design §4), a
     ordem AECR nas objeções e uma linha nova de desconfiança.
  6. **Balões:** até três, um assunto cada, com até uns 30 palavras. Com várias mensagens dela,
     vêm primeiro as perguntas, na ordem em que ela fez, depois o que ela informou, e a pergunta
     no fim. O exemplo do operador vai literal (`BURST_EXAMPLE`).
  7. **`FATOS DO COLETE`** (`productFacts`): material, barbatana, cobertura, cor, calor, horas,
     dormir, exercício, lavagem, pagamento na porta sem listar formas (saiu "em dinheiro ou
     cartão"), outra pessoa recebe, ninguém em casa, transporte e rastreio do antecipado, sem
     boleto, confiança só pelo site e pelo e-mail. Chave nova opcional `site` no `PromptConfig`.
  8. **Cortes para caber:** o parágrafo "Você tem liberdade de estilo", a tática "Antecipe a
     objeção" (o bordão segue citado no "Sem bordão"), "Quem prefere pagar antes paga…" (já
     está em `PAGAMENTO` e nos FATOS LIGADOS), `prepayPriceLine` (código morto) e metade do
     parágrafo `A VERIFICAÇÃO DA LOJA`.
- **Por quê:** decisões do operador de 2026-10-06 sobre o desenho
  [`05-conversa-de-venda-v2.md`](05-conversa-de-venda-v2.md) e o teste real da Leila.
- **Medido: nada contra o modelo.** Tamanho com o config de exemplo e kits: o prompt próprio foi
  de 19 222 para 22 289 caracteres (+16%), e o prompt inteiro, com o briefing dos gates, de 25 276
  para 28 343 (+12%). São ~+850 tokens estimados a ~3,6 caracteres/token, de ~7,0k para ~7,9k. A
  suíte prova: os três balões das duas opções passam `runGates` nas seis variantes de config, com
  região consultada e etapa pré-venda. A mensagem sem entrega passa no antecipado com
  `codUnavailable`. O "sim" padrão passa na entrega e é vetado (`charge_promise`) onde a entrega
  não chega. Fatos e frases negadas passam nos dois caminhos. Nenhuma frase ensinada passa de
  30 palavras. `tests/prompt.test.ts` tem 288 casos, todos passando.
  **A prova que falta** é uma rodada de personas com `muse-spark-1.3` antes e depois. Contar a
  taxa de link, as reescritas por gate por conversa, os balões por resposta e as conversas que
  recebem as duas opções.
- **Regressão:** `pnpm test` dá 6387/6388. A falha é `tests/change-registry.test.ts` M-04, que
  fixava a regra C2 revertida pelo operador. O arquivo não é deste trabalho e o teste precisa
  inverter. `dev:conversas` 1665/1665, `dev:gates` sem nenhum afrouxamento.
- **Conflitos com gate (nenhum gate afrouxado):** `charge_promise` veta "a transportadora ainda
  não faz pagamento na entrega" (cego à negação), por isso o texto diz "não tem".
  `delivery_promise` veta "escolhe um dia em que você vai estar" no antecipado (lê "um dia" como
  prazo de 1 dia), por isso o texto diz "uma data". `coverage_claim` **não** veta "No seu CEP dá
  pra pagar na entrega" com a região não consultada, então só o texto do prompt segura essa
  frase até a consulta.

### 2026-09-24 (d) — Malu adaptável: decisões do operador depois das rodadas 1 e 2

- **Mudou (muitas coisas juntas, a pedido do operador. O efeito de cada uma não é
  atribuível):**
  1. **Tamanho da mensagem.** "Duas ou três frases" virou "até uns 30 palavras por padrão".
     Se precisar de mais, vai em outro parágrafo, separado por linha em branco. Cada
     parágrafo vira um balão (no máximo três, como o `splitBubbles` corta), e nenhum balão
     corta uma frase no meio.
  2. **Pergunta da roupa no máximo uma vez.** Depois que ela responde, a resposta vira
     argumento, e se não respondeu a Malu não insiste. A mesma pergunta nunca volta com as
     mesmas palavras. Preço, pagamento na entrega e os 7 dias saem uma vez por assunto. A
     reversão de risco deixou de mandar "repita com palavras novas" e agora diz "quando ela
     hesitar, não em toda mensagem".
  3. **Garantia** sempre como "N dias após o recebimento", em toda passagem do prompt que
     cita os dias (quatro hoje).
  4. **Handoff.** A abertura parou de "oferecer chamar alguém do time". Um bloco novo diz
     que quem chama pessoa é o sistema, e que ela nunca diz que chamou ou avisou alguém sem
     a instrução do sistema.
  5. **Tamanho.** A Malu ajuda a achar o tamanho perguntando pela calça confortável e se
     ela prefere a roupa soltinha ou justinha. Aceita a cintura em cm quando ela manda
     (antes o prompt dizia "não peça medida em centímetros" e o modelo recusou a Marcinha).
     Nunca recusa uma medida e nunca troca o tamanho que o sistema deu.
  6. **Bloco novo `AS PERGUNTAS QUE MAIS APARECEM`** (`objectionBriefing`): vou pensar, medo
     de errar o tamanho, tá caro, parcelamento/juros, data exata, depoimento/zap de cliente,
     CNPJ, CPF e opt-out com pergunta. O e-mail, sem insistir, ficou no parágrafo dos dados.
     O valor do frete no antecipado "aparece no checkout" e só entra no ramo de frete pago.
  7. **Config nova, toda opcional** (`PromptConfig`). Chave ausente derruba a linha:
     `support.email` (CNPJ), `socialProof.satisfiedCustomers` ("mais de N clientes
     satisfeitas"), `prices.prepayMaxInstallments` ("até Nx no antecipado pelo cartão"),
     `store.physicalStorePlanCity` (a frase do plano de loja; sem ela, volta a resposta
     "toda online") e `delivery.expressActive` (`expressLine`: só `=== true` fala em
     Express; ausente ou `false`, este arquivo não cita a palavra).
- **Por quê:** rodadas 1 e 2 das personas
  (`docs/agente-ia/05-plano/05-rodada-personas-2026-09-24.md`), achados 4, 8, 9, 12, 13 e
  14, mais a decisão do operador de 24/09: uma Malu adaptável, com menos regra rígida e só
  as verdades de dinheiro e de lei fixas.
- **Medido: nada contra o modelo.** A prova que falta é a rodada 3 das personas com
  `muse-spark-1.3-contributor`, contando palavras por mensagem (mediana hoje: 49),
  quantas vezes a pergunta da roupa se repete, reescritas por gate e chegadas ao link
  (hoje 0/12).
  O que a suíte prova: toda frase nova entre aspas passa `runGates` nos dois caminhos e nos
  dois ramos de `freeShipping`; nenhuma passa de 30 palavras; cada chave ausente derruba a
  linha dela. `tests/prompt.test.ts` foi de 116 para 176 casos.
- **Dependência do `guardrails.ts` (trabalho paralelo do especialista de gates):**
  - A frase do plano de loja e `"No pagamento na entrega não tem parcelamento, mas no
    antecipado pelo cartão dá pra parcelar em até 12x."` eram vetadas (`unavailable_offer`
    e `installment_promise`) contra o `guardrails.ts` da HEAD. As duas passam na árvore
    de trabalho de hoje.
  - O teste que fixava "a negação honesta da loja é vetada" foi invertido, como o próprio
    comentário mandava. A metade de loja do gate virou `warn`, então "Pode retirar na nossa
    loja física" **não é mais vetada**, só deixa trace. O teste fixa isso.
  - O bloco "sem as palavras loja, retirada e balcão, nem pra negar" continua no ramo sem
    cidade. Ele pode sair quando a mudança do gate passar pela segunda revisão, e sai numa
    mudança separada.
  - O prompt inteiro, com o briefing dos gates, não cita Express quando `expressActive` não
    é `true`. Isso só vale com o `guardrails.ts` da árvore de trabalho; o da HEAD ainda
    anuncia a Express.
- **Buracos que só o texto do prompt fecha (nenhum gate veta, sondado em 24/09):**
  `"Já chamei uma atendente pra falar com você."`, `"Uma cliente me disse que amou o
  colete."` e `"No antecipado pelo cartão dá pra parcelar em até 12x sem juros."` no caminho
  do antecipado.
- **Regressão:** nenhuma em `tests/prompt.test.ts` (176/176). As falhas da suíte inteira
  estão em arquivos dos outros dois especialistas, ainda em edição: espelhos de
  `sizing.ts` e `identity.ts`, e as conversas "agente inventa loja", que quebram porque a
  loja virou `warn`. Nenhuma delas importa `prompt.ts`.

### 2026-09-24 (c) — achados da rodada 1 com a Muse

- **Mudou (4 coisas juntas, a pedido. O efeito de cada uma não é atribuível):**
  1. Um bloco novo diz o que responder quando ela pergunta onde a marca fica, com o exemplo
     `"Aqui a venda é toda online, pelo site e por esta conversa, e o colete vai direto pra sua
     casa."` e a instrução de não usar "loja", "retirada" nem "balcão", nem para negar.
  2. Teto de 30 palavras por frase, ao lado do piso de oito que já existia. Toda pergunta
     termina em "?", inclusive a que termina em "né" (`"fica mais fácil assim, né?"`).
  3. "Sem bordão": frase pronta ("sendo bem sincera", "você deve estar pensando que...") no
     máximo uma vez na conversa inteira. "Responda antes de perguntar": a primeira frase
     responde o que ela perguntou, a pergunta sobre a roupa abre a conversa e não volta em
     toda mensagem, e quando ela disser que quer, a pergunta leva ao pedido.
  4. A regra de pronome ficou concreta: `Nunca termine uma pergunta com "com ele": diga "com
     o colete".`
- **Por quê:** rodada 1 real com a Muse. Ela respondeu "A gente não tem loja física…", o que
  é honesto, mas `unavailable_offer` vetou porque não enxerga a negação, e soltar o gate
  falhou em quatro rodadas de revisão. Também saíram bordão repetido, a pergunta da roupa em
  toda mensagem, pergunta sem "?" e "voltar a vestir com ele?".
- **Medido:** nada contra o modelo. O exemplo da loja passa `runGates` nos dois caminhos e nos
  dois ramos de `freeShipping`, contra o `guardrails.ts` da `f7b53f7`. A negação que a Muse
  escreveu segue vetada por `unavailable_offer`, e o teste fixa isso: se o gate aprender a
  negação, o teste quebra e este bloco pode ser afrouxado. Nenhuma frase entre aspas no
  prompt passa de 30 palavras, e nenhuma pergunta ensinada termina em "com ele?".
- **Contradição que sobrou, fora do alcance deste arquivo:** o briefing do próprio
  `unavailable_offer` (em `guardrails.ts`, que entra no prompt pelo `gateBriefing`) diz "não
  existe loja física nem retirada no balcão". Ou seja, o prompt ainda mostra ao modelo as
  palavras que o gate veta. O conserto é reescrever esse briefing sem as palavras.
- **Regressão:** nenhuma. 3115/3115 com só esta mudança sobre a `f7b53f7`, e
  `dev:conversas` segue 1640/1640.

### 2026-09-24 (b) — fechamento por escolha sem o antecipado

- **Mudou:** a tática "Feche por escolha" deixou de ensinar `"prefere pagar na entrega ou
  antecipado?"`. Agora diz que nenhuma das duas saídas da pergunta é o antecipado, um dia
  marcado ou um tamanho separado, e dá como exemplo `"Posso já seguir com o seu pedido pra
  pagar na entrega, ou ficou alguma dúvida que eu tiro antes?"`.
- **Por quê:** o prompt se contradizia. A tática oferecia os dois pagamentos e o bloco de
  clareza mandava "Uma oferta só ... não pergunte qual ela prefere". Pela decisão do
  operador, a entrega é O caminho, então vale a regra de uma oferta só.
- **Medido:** nada contra o modelo. O exemplo novo passa `runGates` no caminho da entrega
  nas quatro combinações de frete e desconto. A frase antiga não era vetada por nenhum gate,
  então a contradição só existia no texto e nenhum teste de gate a pegaria. A variante que
  separa tamanho ("reservar o seu M") é vetada por `unverified_size`, e por isso o exemplo não
  cita tamanho. **Ponto cego:** um dia fixo nessa forma ("pra receber na quinta-feira") passa
  todos os gates, então só o texto do prompt impede.
- **Regressão:** nenhuma. 3081/3081 com só esta mudança sobre a `6bceca1`.

### 2026-09-24 — ritmo de conversa e concordância

- **Mudou (1):** o bloco de clareza deixou de mandar "Uma ideia por frase. Frase curta, ponto
  final, próxima." e "criança de 8 anos". Entrou o bloco `COMO VOCÊ ESCREVE`: vírgula mais que
  ponto, com um limite verificável ("duas frases seguidas com menos de oito palavras cada"),
  português falado com "né" no máximo uma vez por mensagem, e o tom de vendedora "o tom, não a
  identidade". As regras de clareza que protegem dinheiro ficaram (número diz a que se refere,
  sem jargão, uma oferta, antecipado como saída); a proibição de "emendar preço, prazo e
  pergunta" virou "preço e prazo ficam colados no pagamento a que pertencem, e os de um
  caminho nunca dividem a frase com os do outro".
- **Mudou (2):** "fechar bonito" saiu da cena concreta (o advérbio `bonito` é a origem mais
  provável de "voltar a usar bonita com ele"); a tática "pergunta viva no fim" ganhou duas
  perguntas-modelo corretas e "uma pergunta por mensagem"; o bloco novo manda reler cada frase
  por concordância nominal, verbal e pronome sem dono ("o colete", não "ele").
- **Por quê:** reclamação do operador em 2026-09-24, lendo respostas reais da Muse — estilo
  telegráfico e a frase "Me conta, qual roupa você queria voltar a usar bonita com ele?".
- **Medido:** nada contra o modelo ainda. As duas mudanças saíram juntas, a pedido, então o
  efeito de cada uma não é atribuível. `tests/prompt.test.ts` prova que as duas
  perguntas-modelo passam `runGates` nos dois caminhos e nos dois ramos de `freeShipping`, e
  `pnpm dev:conversas` segue 1640/1640 — mas o roteiro é determinístico e não chama o modelo.
  **A prova que falta:** rodar as personas contra `muse-spark-1.3` com `reasoning_effort:
  "minimal"` antes e depois, e contar (a) respostas com duas frases seguidas de menos de oito
  palavras, (b) erros de concordância numa leitura humana, (c) reescritas por gate — a (c) não
  pode subir, porque frase mais longa é onde prazo se solta do pagamento
  (`unattributed_window`).
- **Regressão:** nenhuma na suíte (3072/3072 com só esta mudança sobre a HEAD). Caso negado
  coberto: tom humano não é afirmar ser pessoa — "Não sou robô" segue vetado, "Não sou uma
  pessoa, sou a assistente virtual" segue aprovado.
