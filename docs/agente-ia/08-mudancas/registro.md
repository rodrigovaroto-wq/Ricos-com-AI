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
  resposta pronta. Agora a única exceção é "também escolhe / agenda / marca / pode" antes de
  qualquer menção ao antecipado, na oração da entrega que não traz segunda opção de pagamento.
  A proximidade reconhece os nomes do antecipado ("pagando antes", "Pix", "cartão", "boleto"…),
  e prazo "para todos" ("qualquer pagamento", "os dois") iguala. Segunda revisão, três
  rodadas: as versões mais largas deixavam passar 28 frases com prazo inventado para o
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
- **Estado:** aberta (não iniciada — sessão encerrada a pedido do operador). É afrouxamento
  de gate: segunda revisão obrigatória.

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
| O-04 | O workflow `Relógio da régua` autentica a chamada da função com a credencial chamada **"Gemini API"** (`n8n/workflows/relogio-da-regua.json`) e tem `neverError: true` | **Confirmado em 24/09 pelas execuções salvas:** toda varredura recebe `UNAUTHORIZED_INVALID_JWT_FORMAT` ("Invalid JWT") e o n8n marca `success` — a régua de acompanhamento nunca rodou em produção. Correção: trocar a credencial do nó `Varre a regua` para `Supabase service_role` (id `uNGrb6LchX9rT743`). Mudança em produção, espera autorização do operador | aberta |
