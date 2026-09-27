# Registro de mudanças da Malu

> Criado em 2026-09-24, por decisão do operador. **Toda mudança no comportamento da agente
> — prompt, verificação (gate), código do turno, configuração, workflow do n8n — entra aqui
> antes de ser feita.** O Hermes (R11.2), quando houver tráfego real, escreve propostas no
> mesmo formato.

## Por que existe

Nas rodadas 1 a 4 das personas, correções "provadas" por teste de frase voltavam a falhar
com o modelo real, várias mudanças entravam juntas e ninguém sabia qual tinha causado o
efeito, e "resolvido" era opinião de quem lia as conversas. Este registro troca isso por
uma meta escrita antes e um número medido depois.

## Como funciona

1. **Antes de mudar**, abra uma entrada: o quê, por quê (a evidência — persona, rodada,
   mensagem), o **objetivo** e **como medir**. A medida é uma checagem do placar
   (`src/dev/persona-scorecard.ts`); se não existir, a entrada inclui escrevê-la.
2. **Faça a mudança** e anote o commit.
3. **Rode as personas afetadas** (rodada direcionada, `--persona=` + `--concurrency=2`) e
   o placar: `pnpm dev:placar data/persona-runs/<pasta>`.
4. **Preencha o resultado**: atingiu? sim/não, com o número. Se **não**: o que o placar
   mostrou e qual o ajuste — o ajuste é uma nova entrada que aponta para esta.
5. Rodada completa (12 personas) só antes de deploy ou quando várias entradas mudarem juntas.

Estados: `aberta` → `feita (commit)` → `atingida` | `não atingida → M-xx`.

## Placar de referência

| Rodada | Código | Links | Vendas encaminhadas | Respostas prontas | Mediana de palavras | Frases > 30 | R$/resposta |
|---|---|---|---|---|---|---|---|
| R1 | `6bceca1` | 0 | 0 | 2 | 70 | 40% | — |
| R2 | `0743bd2` | 0 | 0 | 2 | 49 | 29% | R$ 0,0018 |
| R3 | `8814026` | 4 | 1 | 0 | 37 | 5% | R$ 0,0026 |
| R4 | `f34e0fa` | 4 | 3 | 1 | 37 | 4% | R$ 0,0027 |
| R5 (8 personas) | `ad46dd1` | 3 | — | 1 | 35 | 4% | R$ 0,0026 |
| R6 (5 personas) | `cc57020` | 3 | 1 | 0 | 48 | 4% | R$ 0,0031 |
| **R7 (12 personas)** | `7225de8` | 3 | 1 | 0 | 37 | 8% | R$ 0,0026 |

---

## Entradas abertas

### M-01 — Com a região desconhecida, as verificações julgam pelo pagamento na entrega
- **Por quê:** R4, Cleide (Manaus, consulta de região fora do ar): "demora quanto pra chegar
  aqui?" → as duas respostas com "1 a 3 dias" vetadas por `delivery_promise` como prazo do
  antecipado → resposta pronta.
- **Objetivo:** nenhuma resposta pronta causada por `delivery_promise` quando a região é
  desconhecida.
- **Medida:** placar `pronta-por-prazo` = 0 e `respostas-prontas` = 0. **Linha de base R4:** 1 e 1.
- **Rodada de verificação:** cleide, rafa, lu.
- **Feito (`ad46dd1`):** a causa estava no gate, não no caminho do turno — com a região
  desconhecida o caminho já era `cod`; o `delivery_promise` julgava qualquer frase que
  citasse "antecipado" como antecipado, mesmo com o prazo na metade "na entrega". Agora o
  prazo pertence ao caminho citado mais perto antes dele. Afrouxa → segunda revisão.
- **Resultado R5** (`data/persona-runs/2026-09-24T21-11-51-553Z-local` (8 personas, `--concurrency=2`, R$ 0,18)): `pronta-por-prazo` = 0 → **atingida**. `respostas-prontas` = 1, por outra causa (Jussara: `price_promise` leu "tiro mais alguma dúvida" como promessa de desconto) → aberta como **M-05**.
- **Ajuste (code review, 2026-09-24):** a lista de palavras que igualam os caminhos ("também",
  "ou", "mesmo"…) valia na frase inteira e bloqueava comparação honesta — "Na entrega você
  também escolhe o dia e recebe em 1 a 3 dias, no antecipado o prazo varia por região" caía na
  resposta pronta. Agora a única exceção é "também escolhe / agenda / marca" — e só quando a frase termina na janela do antecipado — antes de
  qualquer menção ao antecipado, na oração da entrega que não traz segunda opção de pagamento.
  A proximidade reconhece os nomes do antecipado ("antes", "Pix", "cartão", "débito", "link"…),
  e prazo "para todos" ("qualquer pagamento", "os dois") iguala. Segunda revisão, seis
  rodadas: as versões mais largas deixavam passar 49 frases com prazo inventado para o
  antecipado; todas viraram caso vetado em `tests/change-registry.test.ts`. Sem rodada de personas nova — a medida continua
  `pronta-por-prazo`.
- **Estado:** atingida (prazo); resposta pronta restante → M-05.

### M-02 — "Manequim" não define tamanho
- **Por quê:** R3 e R4, Marcinha: "meu manequim é 40" trocou G (calça 44) por M. Na rodada
  3 a mudança foi adiada porque a tabela tem uma coluna "equivale ao manequim" — decisão
  tomada sem medida, e a rodada 4 repetiu o erro.
- **Objetivo:** o tamanho que a Malu diz não muda sem dado novo de calça, cintura ou letra.
- **Medida:** placar `troca-de-tamanho` = 0. **Linha de base:** R3 = 1, R4 = 1.
- **Rodada de verificação:** marcinha, karol, jussara.
- **Feito (`ad46dd1`):** "manequim" saiu do leitor de tamanho (`SIZE_CUE`, `LETTER_RE`) e o
  número colado a "manequim" é descartado. Número de vestido ("visto 42 de vestido")
  continua valendo — tirá-lo quebrava 35 cenários da persona Cida; decisão pendente se a
  regra deve ser só calça, cintura e letra.
- **Resultado R5** (`data/persona-runs/2026-09-24T21-11-51-553Z-local` (8 personas, `--concurrency=2`, R$ 0,18)): `troca-de-tamanho` = 0 (Marcinha e Karol) → **atingida**.
- **Estado:** atingida.

### M-03 — O mesmo link não é mandado duas vezes
- **Por quê:** R4, Jussara: link na mensagem 8 e de novo na 9 ("vou olhar aqui" → "Sem
  problemas" + link).
- **Objetivo:** nenhum link repetido dentro de 3 respostas.
- **Medida:** placar `link-repetido` = 0. **Linha de base R4:** 1.
- **Rodada de verificação:** jussara, karol.
- **Feito (`ad46dd1`):** `linkSentRecently` (janela de 3 respostas) bloqueia o reenvio,
  inclusive no "vou pensar".
- **Resultado R5** (`data/persona-runs/2026-09-24T21-11-51-553Z-local` (8 personas, `--concurrency=2`, R$ 0,18)): `link-repetido` = 0 → **atingida**.
- **Ajuste (code review, 2026-09-24):** a janela comparava com qualquer checkout, então um link
  corrigido não saía — a troca de entrega para antecipado, ou "manda o link de novo". Agora só
  o checkout do caminho deste turno conta, e o pedido explícito dela passa (`asksForLink`:
  lista de formas permitidas — o imperativo abrindo a oração, sem condição depois; "já mandou
  o link", "para de mandar o link", "manda o link só se eu pedir" não contam).
- **Estado:** atingida.

### M-04 — Tamanho quando há interesse; link antes de e-mail e CPF
- **Por quê:** R4, Tati: pergunta de tamanho em 4 respostas seguidas sobre preço e cupom.
  R3 e R4, Cleide: e-mail e CPF pedidos depois de ela querer comprar; ela recusou e esfriou.
- **Objetivo:** pergunta de tamanho em no máximo metade das respostas sobre preço; com a
  decisão e o tamanho, o link sai sem pedir e-mail ou CPF.
- **Medida:** placar `tamanho-na-conversa-de-preco` ≤ 0,5 e `dados-depois-da-decisao` = 0.
  **Linha de base:** R3 = 0,5 e 1; R4 = 0,29 e 0.
- **Rodada de verificação:** tati, cleide, neusa.
- **Feito (`ad46dd1`):** duas instruções no prompt — perguntar tamanho quando houver
  interesse, não em resposta de preço/cupom; com a decisão e o tamanho, link sem pedir nome,
  e-mail ou CPF antes (cliente desconfiada: link primeiro).
- **Resultado R5** (`data/persona-runs/2026-09-24T21-11-51-553Z-local` (8 personas, `--concurrency=2`, R$ 0,18)): `tamanho-na-conversa-de-preco` = 0 e `dados-depois-da-decisao` = 0 → **atingida**.
- **Estado:** atingida.

---

### M-05 — "tiro mais alguma dúvida" não é desconto
- **Por quê:** R5, Jussara, Malu 5: "Quer que eu siga com seu pedido pra pagar na entrega ou
  tiro mais alguma dúvida antes?" vetado 3 vezes por `price_promise` ("promises a discount
  with no number behind it") → resposta pronta. É a pergunta de fechamento que o próprio
  prompt ensina.
- **Objetivo:** nenhuma resposta pronta causada por `price_promise` em frase sem preço.
- **Medida:** placar `respostas-prontas` = 0 (acrescentar uma checagem por gate, como
  `pronta-por-prazo`). **Linha de base R5:** 1.
- **Rodada de verificação:** jussara, tati.
- **Feito (2026-09-24, sessão seguinte):** o gate lia "tiro … mais" como concessão. Agora a
  oração "tiro [mais / pra você / determinante] dúvida(s)" sai do texto antes da varredura de
  concessão sem número; entre "tiro" e "dúvida" só cabem determinantes, então nada que fale de
  preço se esconde no trecho removido. Casos em `tests/change-registry.test.ts` (4 honestas
  passam, 5 concessões vizinhas continuam vetadas). Placar ganhou `pronta-por-preco`.
- **Segunda revisão (2026-09-24): reprovada, corrigida.** A primeira versão soltava seis
  concessões: o verbo servindo a um segundo objeto ("Tiro qualquer dúvida e mais um pouco do
  preço") e uma negação distante puxada para a janela porque o trecho removido encolhia o
  texto. Agora o trecho não sai quando vem "e"/"mais" depois da dúvida, e é trocado por
  espaços do mesmo tamanho. Os sete casos viraram vetados no teste.
  Terceira rodada: mais cinco com "pra você" depois da dúvida ("Tiro sua dúvida, pra você sai
  por menos") — o trecho também não sai antes de "pra/para", nem depois de ":" ou ";".
  Custo aceito: "Tiro mais alguma dúvida pra você?" volta a ser vetada, como antes da M-05.
  Quarta rodada: mais cinco por outra pontuação ou conectivo ("Tiro sua dúvida (pra você um
  pouquinho)", "…, até mais um pouquinho"). Listar separadores não convergia; agora o trecho
  só sai quando a própria janela da varredura não acha palavra de concessão depois da dúvida.
  No caminho, achado anterior: `pouc\w+` não casava "pouquinho", e "Eu tiro um pouquinho." — o
  exemplo do próprio briefing — passava. Corrigido (`pou(?:c|qu)\w+`), com caso vetado.
- **Revisão final (`c48dec6`): aprovada com ressalva.** 24 concessões sondadas, nenhuma passa
  de veto a aprovação. Ressalva registrada: "baixo" como adjetivo e "baixo / diminuo" aplicados
  ao tamanho já eram vetados com "um pouco" e agora também com "pouquinho" ("O cós é baixo, um
  pouquinho abaixo do umbigo", "Diminuo um pouquinho a numeração") — custa uma reescrita, não
  é bug novo. Resíduos anteriores, sem regressão: "Tiro sua dúvida... um pouquinho a menos." e
  "Tiro todas as suas dúvidas, e um pouquinho." (fora da janela de 20 caracteres).
- **Resultado R6** (`data/persona-runs/2026-09-24T22-42-42-250Z-local` (jussara, tati, cleide, rafa, lu, `--concurrency=2`, R$ 0,10)): `pronta-por-preco` = 0 e `respostas-prontas` = 0 → **atingida**.
- **Estado:** atingida.

### M-06 — Prazo do antecipado por proximidade, sem "também" (furo anterior ao ajuste de M-01)
- **Por quê:** a segunda revisão do ajuste de M-01 (2026-09-24, seis rodadas) achou frases que
  já passavam antes dele, com qualquer versão do gate: "No antecipado varia por região; na
  entrega são 1 a 3 dias, e no depósito 2 a 3 dias", "…, e quem paga na compra 2 a 3 dias",
  "…, no antecipado varia por região, nada muda". A proximidade dá a faixa à entrega sempre
  que "na entrega" foi o último caminho citado, e nome do antecipado fora da lista escapa.
- **Objetivo:** nenhuma faixa atribuída ao antecipado passa, com ou sem "também".
- **Direção (da revisão):** aplicar à própria proximidade a regra que a exceção já usa — a
  faixa só vai para a entrega quando, depois da menção ao antecipado, só resta a janela dele.
- **Medida:** as frases acima como casos vetados em `tests/change-registry.test.ts`, e o
  placar `pronta-por-prazo` = 0 numa rodada de personas (endurecer pode trazer resposta pronta).
- **Feito (2026-09-24):** a proximidade só dá a faixa à entrega quando o que vem depois dela,
  até o fim da frase, é no máximo a janela do antecipado (a mesma lista permitida de
  `endsAtPrepayWindow`, mais "e / mas / no / pagando"). As três frases da revisão e outras
  seis ("…, é parecido", "…e chega junto", "pelo site 2 a 3 dias"…) viraram casos vetados; as
  frases honestas de M-01 continuam passando. Resíduo que continua: nome do antecipado fora da
  lista em frase **sem** "antecipado" ("No depósito varia, e na entrega 1 a 3 dias") cai no
  caminho da entrega — fora do escopo da proximidade.
- **Segunda revisão (2026-09-24): nenhuma mentira nova passa, mas 14 frases honestas passaram
  a ser vetadas** — "1 a 3 dias úteis", "no pagamento antecipado", "já / enquanto no
  antecipado", "conforme / de acordo com / depende da região", parênteses. Entraram na lista
  permitida, cada uma com a mentira vizinha como caso vetado.
- **Revisão final (`c48dec6`): aprovada com ressalva.** 23 frases, nenhuma de veto a
  aprovação; três mentiras que passavam agora são vetadas. Ressalva → M-07 (3).
- **Resultado R6** (`data/persona-runs/2026-09-24T22-42-42-250Z-local` (jussara, tati, cleide, rafa, lu, `--concurrency=2`, R$ 0,10)): `pronta-por-prazo` = 0 — o endurecimento não trouxe resposta
  pronta → **atingida**.
- **Estado:** atingida.

### M-07 — Faixa compartilhada antes da entrega, e média do antecipado sem conferência
- **Por quê:** segunda revisão da M-06 (2026-09-24), furos anteriores a ela: (1) um nome do
  antecipado ligado à entrega por "e" antes da faixa dá a faixa só à entrega — "No antecipado
  varia por região, e no pix e na entrega, 1 a 3 dias", "…; no cartão e na entrega, 1 a 3
  dias"; (2) "em média N dias" apaga qualquer número — "…no antecipado o prazo varia em média
  1 dias" passa sem nenhum gate disparar. (3) depois da faixa, "e no (pagamento) antecipado" sem
  janela própria lê como "a mesma faixa lá" e passa — "…na entrega chega em 1 a 3 dias e no
  pagamento antecipado." A lista permitida só confere que nada sobra; deveria exigir o nome do
  antecipado seguido da janela dele ("varia / depende / conforme / em média").
- **Objetivo:** nenhuma faixa ou média inventada para o antecipado passa.
- **Medida:** as frases acima como casos vetados em `tests/change-registry.test.ts`; placar
  `pronta-por-prazo` = 0 numa rodada cleide, rafa, lu.
- **Feito (2026-09-25):** uma regra só dos dois lados da faixa (`onlyPrepayWindow`): o
  trecho entre a primeira menção ao antecipado e "na entrega", e o que vem depois da faixa,
  só podem conter a janela do antecipado — e a menção precisa trazer a janela dela ("varia /
  depende / conforme / em média"). A média é conferida com ou sem "úteis" ("em média 1 dias",
  "cerca de 3 dias"), e só o número que fecha uma faixa é pulado — antes a frase inteira era
  pulada quando tinha faixa em dias úteis. `pnpm dev:gates`: 0 afrouxamentos, 13
  endurecimentos, todos mentira; nenhuma resposta das rodadas de personas mudou.
- **Segunda revisão (2026-09-25): reprovada, refeita na raiz.** A média era lida por lista de
  formatos, e 12 formatos escapavam ("2 dias em média", "uns 3 dias", "dois dias", "em até 2
  dias", "pra sua região 2 dias"). Trocada por uma regra de número: em frase do antecipado —
  ou, no caminho antecipado, em oração que fala de entrega — **todo número de dias que não
  fecha a faixa da entrega é a média configurada**, e a frase diz que varia. Troca, devolução,
  reembolso e "você tem 7 dias" (garantia) ficam de fora. A lista permitida da faixa passou a
  aceitar os mesmos formatos de média que a regra aceita (antes, o gate aprovava a média numa
  linha e vetava a mesma frase três linhas abaixo). Achado da regra nova: no caminho
  antecipado, "você recebe em até 3 dias" passava — prazo inventado para o antecipado.
  `pnpm dev:gates`: 9 liberações intencionais (aceitas em `tests/gate-loosen-accepted.txt`),
  37 endurecimentos, todos mentira.
- **Terceira revisão (2026-09-25): reprovada, corrigida.** A regra de número vetava a recusa
  honesta ("Não consigo garantir 2 dias no antecipado…") — agora a negação que governa um verbo
  de promessa, na mesma oração do número, libera; "não demora, chega em 2 dias" continua vetada.
  As exceções (troca, devolução, garantia, "você tem 7 dias", "faz 3 dias que") ficaram presas
  ao número, não à oração ("chega em 2 dias com garantia" se escondia atrás delas). A regra lê
  os outros nomes do antecipado antes do número (pix, boleto, "pagando antes/agora", "no
  cartão"; "dinheiro ou cartão" continua sendo a porta). `pnpm dev:gates`: 2 liberações
  intencionais, 9 endurecimentos, todos mentira.
- **Quarta revisão (2026-09-25): reprovada — e a causa era de método.** Cada exceção
  (recusa, garantia, troca, "após o recebimento") é um afrouxamento, e cada rodada achou a
  mentira seguinte escondida atrás dela, em frases que não estavam no corpus — então o
  `dev:gates` não as via. Duas mudanças: (1) as exceções passaram a depender de uma condição
  só — nenhum verbo de entrega governa o número ("chega em 2 dias", "prazo de 2 dias"); e a
  recusa só libera "não consigo/posso garantir/prometer N" colado ao número; (2)
  `tests/prepaid-deadline-fuzz.test.ts` gera 1560 mentiras (toda isca × nome do antecipado ×
  verbo × número) e exige veto em todas — a propriedade, não o exemplo. `pnpm dev:gates`: 3
  liberações pedidas pela revisão, 2 endurecimentos no caminho antecipado.
- **Quinta revisão (2026-09-25): reprovada — exceção por contexto vaza.** "Nenhum verbo de
  entrega governa o número" liberou "a troca é grátis e no pix chega em só 2 dias" e "no pix
  leva 7 dias, com garantia". As exceções viraram **formas exatas presas ao número**: "tem/com
  (até) N dias pra trocar / de garantia / após o recebimento", "devolver/reembolso em N dias",
  "recebe em N dias o dinheiro de volta" e "garantia …: N dias" (só o N da garantia). Qualquer
  outra forma é prazo. O fuzz passou a 3000 mentiras (10 nomes do antecipado, incluindo "à
  vista", "online", "pelo link", "se pagar hoje"). `pnpm dev:gates`: 2 liberações pedidas, 0
  endurecimentos.
- **Sexta revisão (2026-09-25): reprovada — formas exatas vetavam garantia honesta**, inclusive
  a frase que o `warranty_promise` ensina. A regra que segura é sobre o **número**: só a
  garantia configurada (7) é garantia. Qualquer outro número no caminho antecipado é prazo,
  sejam quais forem as palavras ("garantia de 2 dias", "2 dias após o recebimento"). O 7 só é
  isento quando está preso a uma palavra de troca/devolução e nenhum verbo de entrega o governa
  ("chega em 7 dias pra trocar" e "a entrega tem garantia de 7 dias" continuam prazo).
  Reembolso não é entrega, em qualquer número. Fuzz: 3500 mentiras vetadas, 20 garantias
  honestas passando. `pnpm dev:gates`: 10 liberações (as garantias honestas da revisão), 8
  endurecimentos no antecipado — todos garantia com número errado ("30 dias de garantia").
- **Sétima revisão (2026-09-25):** a regra do número segurou todas as mentiras com número ≠ 7;
  sobravam as que prendem o próprio 7 à entrega depois dele ("7 dias pra entrega", "e a
  entrega também"). O 7 agora é garantia só quando nem a oração dele nem o resto da frase
  falam de entrega (a âncora "após/a partir do recebimento", "quando o colete chegar" é
  permitida) e há finalidade de troca logo depois ou palavra de troca no trecho dele. Fuzz:
  3540 mentiras; `pnpm dev:gates`: 6 liberações (garantias honestas), 0 endurecimentos.
- **Oitava revisão (2026-09-25):** a âncora "quando o colete chegar" era removida mesmo quando o
  7 era o complemento de tempo dela ("quando o colete chegar em 7 dias"), e "em 7 dias" num
  trecho só dele contava como garantia. Corrigidos; a âncora ganhou "depois que receber" e
  "após/a partir da entrega". Fuzz: 3600 mentiras; `pnpm dev:gates`: 3 liberações, 0 endurecimentos.
- **Revisão final (2026-09-25, `920214f` + âncora no fim da frase): APROVADA com resíduos.**
  Nenhuma mentira que a base vetava passa; nenhuma frase honesta passou a ser vetada. Resíduos
  de baixa prioridade: M-08 (prazo em palavras) e formas raras de garantia honesta ainda
  vetadas no antecipado (custam uma reescrita). **Nove rodadas de revisão**: a lição está em
  `.claude/memory/negation-blindness.md` — exceção por contexto vaza; a regra que segura é
  sobre o número, com fuzz gerando as mentiras.
- **Resultado R7** (rodada completa, 12 personas, `data/persona-runs/2026-09-25T01-17-14-806Z-local`,
  R$ 0,19): `pronta-por-prazo` = 0 e `respostas-prontas` = 0 → **atingida**.
- **Estado:** atingida.

### M-08 — Prazo do antecipado em palavras que a regra de número não lê
- **Por quê:** terceira revisão da M-07, resíduos anteriores a ela: "No antecipado, um dia só."
  ("um/uma" ficam fora de propósito — "um dia marcado"), "No antecipado chega em uma semana."
  (semanas não são lidas), "Em 2 dias ele está aí na sua casa." (sem verbo de entrega da lista).
- **Objetivo:** nenhum prazo do antecipado passa por estar em palavras.
- **Medida:** as três frases como casos vetados, e `pnpm dev:gates` sem afrouxamento.
- **Feito (2026-09-26):** a regra de número de `delivery_promise` conta "um/uma/num/numa" e
  semanas (semana = 7 dias corridos: pode ser a garantia, nunca a média, que é em dias úteis);
  no antecipado, frase sem nome de caminho é prazo salvo quando a própria oração fala de uso
  ("2 dias de uso", "se acostuma", "adapta") e não fala de entrega — a lista de verbos saiu
  do caminho, porque a chegada tem palavras demais. "Um dia marcado/especial/de festa" não é
  contagem. Testes em `change-registry.test.ts` e dois geradores no fuzz; mutações `M-08` e
  `M-08-chegada` em `verify-guards.ts`.
- **Revisão independente (NEEDS WORK, corrigida em 2026-09-26):** (1) faixa em semanas ("1 a 2
  semanas") passava nos dois caminhos — a checagem de faixa lê semanas (×7) e o fim de faixa
  só se isenta em dias; (2) a âncora da garantia recuava dentro de "chega/receber" e escapava
  do próprio lookahead ("…pra trocar quando chegar em 7 dias") — `\w*\b`; (3) a palavra de uso
  em qualquer lugar da oração isentava ("em 3 dias ele está aí pra você se adaptar") — agora
  só "N dias de uso", "se acostuma (com ele) em N dias" e "em N dias você se acostuma"
  isentam, e as outras orações da frase só podem dizer que ela não sente o colete; (4) o
  arrependimento "7 dias pra desistir, a contar do dia que receber" voltou a passar
  (`desist*` na garantia, "a contar do (dia que)" como âncora). Três geradores novos no fuzz
  (faixas em semanas, prazo atrás de âncora, chegada com isca de uso) e mutações
  `M-08-semanas`, `M-08-ancora`, `M-08-uso`.
- **Segunda revisão (NEEDS WORK, corrigida em 2026-09-26):** (1) afrouxamento real — o
  lookahead da âncora só protegia a contagem colada ao verbo, e "tem 7 dias pra trocar quando
  chegar aí em 7 dias" virava garantia: a âncora não é retirada quando uma preposição de tempo
  ("em/até/dentro de") antes da contagem está na mesma oração do verbo dela, sem verbo de
  troca no meio; (2) a palavra de troca antes de ":" ou de "e ele está aí" isentava a chegada
  sem verbo — a isenção pela troca antes da contagem não atravessa oração nova depois da
  última palavra de troca; e "…, que é quando ele chega" não é mais apagado como âncora.
  Geradores: âncora × enchimento × contagem, e troca/desistência ao lado da chegada; mutações
  `M-08-enchimento`, `M-08-troca-chegada`, `M-08-que-e-quando` (e `M-08-ancora` passou a
  reinstalar a âncora inteira da primeira revisão, porque o lookahead novo também barra o recuo).
- **Terceira revisão (NEEDS WORK, sem afrouxamento; corrigida pela causa em 2026-09-26):** os
  consertos da segunda eram de sintoma. (1) A contagem na mesma oração do verbo da âncora é
  complemento dele, qualquer que seja a preposição ou o quantificador ("quando chegar lá pra
  você em uns 7 dias", "…com 7 dias"): a âncora só é retirada quando outra oração começa antes
  da contagem ou quando "(você) tem / são / é (até/de)" a toma logo antes; (2) conjunção
  (e/mas/que/porque/pois/já que), com ou sem preposição de tempo, colada à contagem abre
  oração, e a palavra de troca de antes não a isenta; (3) a âncora depois da contagem só é
  retirada colada a ela ou ao propósito ("7 dias corridos, contados do recebimento", "7 dias
  pra desistir, a contar do dia que receber"), nunca como aposto ("…, quando ele chega", "…,
  que é bem quando ele chega"); (4) ":" seguido de "você tem / são / fica" não abre oração
  ("é só trocar: você tem 7 dias depois que ele chegar" voltou a passar). Três geradores
  (preposição × quantificador × enchimento, conjunção × preposição, âncora solta); mutações
  `M-08-complemento`, `M-08-conjuncao`, `M-08-dois-pontos`, e `M-08-que-e-quando` passou a
  reinstalar a retirada da âncora em qualquer lugar.
- **Quarta revisão (NEEDS WORK, sem afrouxamento; ônus invertido em 2026-09-26):** quatro rodadas
  fechando formas enquanto as irmãs ficavam abertas. O código deixou de retirar âncoras e caçar
  vestígio de entrega: a contagem da garantia (7 dias ou uma semana) só é isenta quando uma
  forma de garantia a **governa** — propósito colado depois ("pra trocar/devolver/desistir",
  "de garantia/arrependimento"), palavra de troca tomando-a logo antes ("a troca é (de/em até)",
  "pode trocar em (até)"), ou "tem/são/é N" depois de uma troca sem chegada no meio — e o que vem
  depois é fim de frase, "corridos/úteis", o propósito ou o início da contagem ("depois que
  receber", "contados de quando ele chegar", "a contar do dia que receber"). Depois disso só
  cabe oração nova que não fale de chegada nem de tempo. A âncora de chegada antes da contagem
  não vale depois de "até / o prazo / o tempo". Saíram `anchor`, `anchorAfter`, `glued`,
  `newClause`, `returnBefore`. Geradores: "o prazo/tempo até quando chegar é de N", conjunção +
  quantificador + N + chegada sem verbo, e 384 garantias honestas que têm de passar. Mutações
  reescritas: `M-08-governo`, `M-08-cauda`, `M-08-oracao-propria`, `M-08-ate-quando`,
  `M-08-tomada` (as sete da segunda e terceira revisões miravam código que não existe mais).
- **Quinta revisão (aprovada com ressalvas; falsos positivos corrigidos em 2026-09-27):** o
  ônus invertido não deixa passar nenhuma mentira de chegada, mas vetava frases honestas. (1) As
  falas do roteiro e da base de conhecimento ("contando do dia que receber", "contando da data
  em que você recebe", "contados da entrega", "a partir do dia que receber") — o início da
  contagem passou a conhecê-las, e "você tem 7 dias contando de quando recebeu" é garantia por
  começar no recebimento; depois de ";" começa outra afirmação, e ali só verbo de entrega é
  julgado; (2) a troca com objeto ou adjetivo ("pra trocar de tamanho", "pra devolver o
  produto", "a troca é grátis em até 7 dias", "a garantia é igual: 7 dias", "a garantia de 7
  dias vale nos dois", "pra pedir a troca"); (3) a chegada em palavras depois da garantia ("e
  ele está com você", "e o colete é seu", "já abre a caixa") passou a ser lida. Geradores de
  474 falas honestas e 90 chegadas em palavras; mutações `M-08-roteiro`, `M-08-objeto`,
  `M-08-presenca`.
- **Estado:** fechada (aprovada com ressalvas na quinta revisão; ressalvas corrigidas).

### M-09 — Kits de 2 e 3 peças (decisão do operador, 2026-09-25)
- **Por quê:** o checkout da Coinzz vende quantidade fixa; o operador criou um link por
  quantidade e caminho, com desconto crescente (entrega 0/10/20%, antecipado 10/20/30%).
- **Decisões do operador:** a Malu pergunta o tamanho de cada peça; oferece o kit uma vez, na
  decisão; 4+ peças vão para uma pessoa; kits antes do deploy.
- **Feito:** `config.kits` (opcional); `price_promise` aceita só preço/percentual de kit **do
  caminho e da quantidade da frase**, economia de kit em reais vetada (com ou sem "R$", e após
  "economiza/poupa"); intérprete lê quantidade e tamanhos com guarda determinística (pista de
  quantidade, negação); turno escolhe o link do kit, pede cada tamanho, zera após a compra;
  migrações 0009 e 0010 (aplicadas); n8n lê o payload real da Coinzz e "M,G".
- **Revisões:** `pricing-guardian` (7 falsidades de caminho/quantidade e economia de kit) e
  `code-reviewer` (venda de kit falharia no banco; tamanho duplicado na nova tentativa;
  instruções contraditórias; kit não zerado) — todos corrigidos, com teste e mutação.
- **Medida:** placar sem regressão numa rodada de personas com o config de kits; `kits.test.ts`.
- **Rodadas (2026-09-25):** 4 personas (`04-51-46`), placar 8/8, kit oferecido uma vez;
  `persona-dupla` recebeu o link do kit 2 na entrega e corrigiu "3 com 30% na entrega". Achado
  da rodada: "uso 42, ela 46" fazia a Malu pedir a letra, e a cliente chutou M (a tabela diz
  G). Corrigido na origem — o intérprete lê `unit_pants` e cada número passa pela mesma
  `sizeFromDressSize` de 1 peça. Rodada `05-03-22`: "G e GG" sem perguntar, placar 8/8.
- **Hermes sobre a rodada:** 1 proposta (H-1, M-03) — o placar contava como link repetido
  o reenvio que a cliente pediu, que a produção já libera por `asksForLink`. Aceita: o placar
  usa a mesma função (`persona-scorecard.test.ts`).
- **Loop de verificação (tarde de 2026-09-25):** nove passadas de revisão independente
  (`code-reviewer`), cada uma sobre as correções da anterior, até **aprovado com resíduos**.
  Achados reais corrigidos na origem, todos com teste e mutação:
  - o gate vetava a fala 7.1 do script ("R$ 116,91 em vez de R$ 129,90");
  - pedidos comuns de kit viravam 1 peça ("quero 2, M e G");
  - correção do próprio tamanho virava tamanho da outra peça;
  - o kit abandonado voltava dias depois (nada fecha conversa: expira por tempo, `units_at`);
  - **o caminho escolhido valia só na mensagem** (o turno seguinte ao "quero no pix" mandava
    o link da entrega): agora fica em `leads.payment_choice`, gravado só quando a frase é
    escolha (`choosesPath`) e expirando em 7 dias sem uso;
  - o gate recebe a quantidade de peças da conversa (`ctx.units`) em vez de adivinhá-la;
  - **a régua pós-compra falava o preço de 1 peça num kit** ("deixa R$ 129,90 separado"
    num pedido de R$ 233,82) e mandava "separar dinheiro" em pedido já pago: agora lê o
    pedido (total, peças, tamanhos, caminho);
  - peça grátis sem número ("a segunda sai de graça", "leve 2 pague 1") é concessão;
  - "tchau brigada" virava nome; "obrigada, já finalizei" virava handoff; a despedida
    reenviava o link — o handoff de pós-venda agora exclui só o encerramento feliz, por
    lista de permissão;
  - numa frase que compara os caminhos, cada prazo responde ao caminho citado antes dele.
- **Resíduos aceitos** (revisão, 9ª passada): dois kits na mesma frase com os preços
  trocados; "na troca, o colete novo sai de graça" veta (custa uma reescrita); dois pedidos
  no mesmo lead fazem a régua ler o último.
- **Medida final:** rodada completa `06-19-27` (15 personas) e confirmação `06-37-29`: 8/8,
  0 respostas prontas; `pnpm verificar:guardas` 56/56.
- **Estado:** feita e medida.

## Entradas fechadas (reconstruídas das rodadas 1 a 4)

Feitas antes deste registro; o resultado vem das rodadas e do placar recalculado.

| # | Mudança | Objetivo | Medido em | Resultado |
|---|---|---|---|---|
| H-01 | Tom de conversa: vírgula antes de ponto, releitura de concordância (`6bceca1`) | Mensagens naturais, sem erro de concordância | R2→R3 | **Atingida:** mediana 70 → 37 palavras; nenhum erro de concordância na R3 |
| H-02 | Teto de 30 palavras por frase e sem bordão (`0a18cdf`, `768ba1e`) | Frases > 30 palavras abaixo de 10% | R3 | **Atingida:** 40% → 5% |
| H-03 | Intérprete antes da resposta (R13.1, `36387f4`) | Ler a cliente de qualquer jeito que ela escreva | R3/R4 | **Atingida em parte:** tamanho, decisão e pedido de pessoa lidos; "manequim" ainda não (M-02) |
| H-04 | Handoff só em pedido de pessoa, cancelamento e pós-venda (R13.2) | Handoff certo, sem falso positivo | R4 | **Atingida:** 3 de 3 certos (Lu, Vera, Sandra); nenhuma objeção virou handoff |
| H-05 | Link sem depender de e-mail ou CPF (R13.4) | Quem decide recebe o link | R3/R4 | **Atingida:** 0 → 4 links; 3 vendas encaminhadas na R4 |
| H-06 | Escada do tamanho (R13.4) | Sem loop com cliente telegráfica | R3/R4 | **Atingida:** Neusa, 3 frases e silêncio |
| H-07 | Gates duros e brandos (R13.3) | Menos respostas prontas | R3/R4 | **Atingida:** 2 → 0 → 1 (a de R4 é M-01) |
| H-08 | Respostas de objeção do operador (R13.5) | CNPJ, loja, depoimentos, frete, prazo, parcelas como definido | R3/R4 | **Atingida:** todas usadas como definido |
| H-09 | Tirar a expressa do prompt (R13.5) | Nunca prometer entrega no mesmo dia | R3/R4 | **Atingida:** 0 menções |
| H-10 | Não afirmar cobertura sem consulta (`coverage_claim`, `729159a` → `884b6ba`) | Nunca dizer que chega sem a consulta de região | R4 | **Atingida:** Cleide ouviu "o checkout confirma" |
| H-11 | Nome da destinatária no link (`729159a`) | Link com o nome certo | R4 | **Atingida:** "Maria Jose Ferreira" |
| H-12 | Host da Muse e orçamento de raciocínio (`85892dc`, `39ef9bb`) | Nenhuma resposta vazia | R1 em diante | **Atingida:** 0 respostas vazias |

## Fora do alcance do código (do operador)

| # | O quê | Por quê | Estado |
|---|---|---|---|
| O-01 | Consulta de região da Coinzz (`stock-and-delivery-day` redireciona para a home desde 24/09) | Sem ela a Malu não oferece o antecipado a quem não tem pagamento na entrega | aberta |
| O-02 | Link de checkout no domínio da marca | R3: Jussara desistiu por causa de `logzz.com.br` | aberta |
| O-03 | Confirmar "mais de 500 clientes satisfeitas" e "planos de loja em São Paulo" | A Malu afirma os dois para toda cliente | aberta |
| O-04 | O workflow `Relógio da régua` autentica a chamada da função com a credencial chamada **"Gemini API"** (`n8n/workflows/relogio-da-regua.json`) e tem `neverError: true` | **Confirmado em 24/09 pelas execuções salvas:** toda varredura recebe `UNAUTHORIZED_INVALID_JWT_FORMAT` ("Invalid JWT") e o n8n marca `success` — a régua de acompanhamento nunca rodou em produção. Correção: trocar a credencial do nó `Varre a regua` para `Supabase service_role` (id `uNGrb6LchX9rT743`). **Feito em 25/09:** credencial trocada para `Supabase service_role`, gatilho de 5 min religado (o rascunho o tinha desligado), `neverError` desligado. Varredura das 00:25: `swept`. **Origem fechada:** a exportação versionada era o rascunho, não o que roda; `pnpm dev:n8n` baixa a versão ativa e falha se uma chamada à Edge Function usar outra credencial, tiver `neverError`, gatilho desligado ou timeout do turno < 150 s (`tests/n8n-workflows.test.ts`). A credencial "Gemini API" não é mais usada por nenhum workflow | fechada |
