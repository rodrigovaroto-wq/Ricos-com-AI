# Revisão final com personas antes do smoke test (2026-10-24)

Pedido do operador: testar tudo o que entrou nos PRs #76, #77, #80, #81 e na branch `claude/focused-cannon-lk2wim` (R31), e a Malu
inteira, gastando entre R$ 4 e R$ 5, até R$ 0,05 por lead.

## Como foi feito

- **`turn` local, código do disco** (branch R31, ainda não publicada), contra o banco de produção. Config de produção
  (`business-config-2026-10-23.min.json`) com expediente 24 h e e-mail do operador trocado por um falso. Modelo da produção:
  `muse-spark-1.3-contributor`.
- **Três suítes:**
  - **51 fichas de cobertura**, das quais 16 são novas, escritas para as funcionalidades dos últimos PRs (taxonomia O1–O11);
  - **14 personas de segurança**;
  - **16 compradoras** com propensão escondida, em 3 seeds.
- **Volume:** 132 leads sintéticos, todos apagados ao fim. Os 42 leads reais ficaram intactos e nenhum pedido foi criado.
- **Gasto:** R$ 4,03 no total (persona + Malu), média de R$ 0,031 por lead. As conversas longas (12 turnos) passaram de R$ 0,05:
  - jussara, R$ 0,10;
  - venda-sem-dinheiro, R$ 0,12.
- **Leitura:** quatro auditorias independentes (Opus), conversa por conversa, além dos alertas automáticos.
- **Conferência na Logzz:** a cobertura por cidade e por tamanho foi consultada direto, com a mesma `lookupRegion` da produção.
- **Relatórios:** `data/persona-runs/2026-10-24T18-*` e `2026-10-24T19-*`, fora do Git.

## 1. Fato operacional que muda a decisão de anúncio

O pagamento na entrega depende do **estoque de cada tamanho em cada cidade**, não da região. Consulta de 24/10 (✓ = tem pagamento
na entrega):

| Cidade | P | M | G | GG | XGG |
|---|---|---|---|---|---|
| São Paulo (Santo Amaro) | ✗ | ✗ | ✓ | ✓ | ✓ |
| Campinas | ✗ | ✗ | ✓ | ✓ | ✓ |
| Osasco | ✗ | ✗ | ✓ | ✓ | ✓ |
| Belo Horizonte | ✗ | ✓ | ✓ | ✓ | ✗ |
| Rio de Janeiro (Penha) | ✓ | ✗ | ✗ | ✓ | ✓ |
| Salvador | ✗ | ✗ | ✓ | ✗ | ✓ |
| Natal | ✗ | ✗ | ✗ | ✓ | ✓ |
| Recife (Boa Viagem e Centro) | ✗ | ✗ | ✗ | ✗ | ✗ |

- **P e M quase não têm pagamento na entrega** (o M só em BH, o P só no Rio).
- **Recife não tem em nenhum tamanho.**

Na simulação, 12 de 16 compradoras da seed 2 caíram no antecipado. O anúncio promete "pague na entrega", e a cliente M ou P de quase
todo lugar não consegue. **Antes de ligar o tráfego: repor estoque na Logzz ou mirar o anúncio nas praças e tamanhos que têm.**

## 2. Defeitos que custam venda (alta)

| # | Defeito | Recorrência | Onde (exemplo) |
|---|---|---|---|
| A1 | **O link não sai quando ela pede.** "lá no checkout você escolhe o G", "confirma pra mim?", sem link; até 6 turnos de atraso | 9 conversas | venda-compra-forte T6–T9, gatilho-formatura T5–T7 (sem link no fim), jussara T7–T9, pago-na-entrega-sim T7–T12 |
| A2 | **Coleta de nome quebrada.** Nome de duas palavras pedido de novo ("Fernanda Lima" → "nome completinho"); lixo no link (`name=Daiane+Santos+O+Resto+Passo`); nome dado e ausente no link do antecipado | 10+ | venda-decidida, cep-novo-depois-link, cep-em-pedacos, sem-dinheiro |
| A3 | **A oferta promete a entrega antes de saber o tamanho, e depois volta atrás.** "Chegará já segunda… Não Paga Nada Agora", e no turno seguinte "No M, o pagamento na entrega infelizmente não está disponível" | 6+ | irma-que-isso T7–T8 (desistiu), recompra, cep-errado |
| A4 | **O cartão do antecipado não diz por que não há entrega.** "Você Ganhou um Desconto Adicional de 10%!!! … Vamos agendar seu pedido" para quem pediu pagamento na entrega; e, quando o motivo aparece, é "na sua região", mas o motivo real é o tamanho | 13 de 14 cartões | venda-some (sumiu na hora), com-pressa, tamanho-m-sp |
| A5 | **Falsos vetos de gate viram resposta genérica** ("me fala de novo o que você quer saber?" ou a linha de segurança), ignorando a pergunta | ~20 vetos | ver a §4 |
| A6 | **CEP novo depois do link não é consultado de novo:** "você usa o mesmo link e preenche lá com o endereço de Manaus" | 2 de 2 | cep-novo-depois-link T8 |
| A7 | **Rua no lugar do CEP não é consultada:** "av afonso pena 1500 centro bh" → "você confere quando digitar o CEP no checkout" | 2 de 2 | rua-sem-cep |
| A8 | **O link do antecipado é travado por falta de CEP**, embora o checkout peça o endereço: "o link sai atrelado ao CEP… o sistema não gera" (frase falsa); kit de R$ 272,79 perdido | 1 | kit-antecipado-frete (seed 2) T5–T10 |
| A9 | **Mentira de LGPD:** "confirmado, apaguei tudo que você informou aqui". Nada é apagado | 1 | lgpd-dados T6 |
| A10 | **Endossa um link de checkout colado pela cliente** (`encorpa.pay/...`): "Combinado, fica no seu nome assim" | 1 | venda-decidida (seed 2) T5 |

## 3. Defeitos médios

- **Cupom.** "Não temos cupom no momento" com o `SUPER20` ativo, que a régua manda depois. A objeção de preço ("igual por 59", "é mais
  o valor") não é contornada com o kit nem com o cupom.
- **Resposta pronta fora de hora.** "Claro! Você tem 7 dias após o recebimento pra trocar ou devolver. Ficou alguma dúvida…?" sai
  para "vou pensar", "obrigada", aceite de ofertas e até recusa. São ~12 vezes por rodada.
- **Tamanho perguntado de novo.**
  - O extrator não lê "40 eu uso", "vesto 44", "tem calça 48 em estoque?".
  - O cartão de oferta termina com "Qual o número da calça?" depois de ela ter dito.
- **"Na maioria das regiões dá pra pagar na entrega".** É falso diante da tabela da §1 e é ensinado pelo prompt. Aparece 7 vezes por
  rodada.
- **Reserva inventada.** "o M já fica reservado", "seu G fica lá te esperando".
- **Promessa de pagamento sem consulta.** "Dá pra deixar pra depois do dia 5" e "dá sim, dependendo da região", ditos antes do CEP.
- **Gatilho pessoal citado mais de 3 vezes** (formatura 5 vezes, vestido 4 vezes).
- **Aceite de ofertas.** A pergunta não apareceu; quem ofereceu ("pode mandar as promoções") ouviu a resposta pronta.
- **Frete do kit no antecipado não dito.** "o valor do frete de 3 peças no pix eu não tenho como te passar".
- **Pergunta direta sem resposta:**
  - "quantos dias pra chegar";
  - "e o frete? paga à parte?";
  - "puedes hablar en español";
  - "me manda áudio que eu não enxergo".
- **Promessas de produto fora dos fatos:**
  - "segura a postura" (idosa-desabafo);
  - "acompanha bem o quadril" (ajuda-tamanho), que nenhum gate pegou;
  - "Pode sim" para homem.
- **Calça 56 lida como XGG com "serve sim".** O prompt diz que a tabela vai até 52, e o `sizing.ts` vai até 56: decisão do operador.
- **"Chegará já sexta (30/10)"** num sábado, 24/10: 6 dias, contra o "1 a 3 dias".
- **O áudio da oferta diz "consigo agendar pra amanhã mesmo"** e o texto diz "segunda (26/10)" (achado A10 do parecer).

## 4. Gates com falso veto (frases verdadeiras vetadas)

Cada um leva a resposta a cair em reescritas e na resposta genérica:

| Gate | Frase verdadeira vetada | Vezes |
|---|---|---|
| `shipping_promise` | a frase canônica do frete grátis ao lado de "pode pagar no Pix ou no cartão **na porta**" (a regra lê pix/cartão como o antecipado, mas na porta também se paga assim) | 11 |
| `charge_promise` | a explicação de que ali não chega o pagamento na entrega ("na sua ainda não chega") | 8 |
| `installment_promise` | "no antecipado: Pix ou até 12x" junto com a explicação da cobertura; e no kit, sem falar de parcela | 7 |
| `delivery_promise` | "7 dias de garantia" lido como prazo; "quem escolhe o dia é você no checkout" | 6 |
| `size_claim` / `unverified_size` | "o maior que a gente tem é o XGG" | 4 |
| `invented_testimonial` | depoimentos do próprio config | 2 |
| `cep_insist` | "não encontrei esse CEP" (o CEP inválido some sem aviso) | 2 |

O gate novo `operational_claim` (R31) **não vetou nada em 132 conversas**: o prompt já ensina as três frases. Ele fica como rede.

## 5. Funcionalidades dos últimos PRs

| Funcionalidade (PR) | Resultado |
|---|---|
| Boleto, horário e correio (R31) | ✅ boleto e horário certos em todas as conversas; correio certo, mas só depois de 2 respostas genéricas (falso veto do `shipping_promise`) |
| E-mail do suporte no pedido de pessoa (R31, A4) | ✅ "contato@encorpa-fashion.com.br" saiu |
| Cancelar pedido já enviado (R31, A5) | ⬜ não exercitável por persona (exige pedido gravado); coberto por teste e mutação |
| Objeção vaga (#77) | ✅ uma pergunta, sem repetir; ❌ a resposta pronta dispara fora de hora (§3) |
| Gatilho pessoal (#77) | ✅ o balão antes da oferta funcionou; ❌ o limite de 3 usos passou (5 vezes) |
| Escassez só com estoque real (#77) | ✅ nunca inventou; a linha de estoque baixo não apareceu (nenhum tamanho abaixo de 20) |
| Frete do antecipado na oferta (#77/#80) | ✅ 1 peça ("Frete pra sua região: R$ 28,25"); ❌ kit de 3 sem frete e link travado (A8) |
| Consulta da Logzz como o checkout (#80, v43) | ✅ sem "consulta instável"; Recife responde "sem entrega" de verdade (estoque, §1) |
| Sem 2º lembrete, régua por faixa (#80) | ⬜ o tempo não passa na rodada de personas |
| Rua no lugar do CEP, CEP novo depois do link (#76) | ❌ A6 e A7 |
| `support_before_order` (#76) | ✅ mudança de endereço antes do pedido resolvida pela Malu |
| Troca de tamanho, número do atendimento (§115) | ✅ "+55 11 98819-4261", sem nome de pessoa |
| Imagem da cliente em `messages.media` (#81) | ⬜ é a função `whatsapp`, fora da porta local |

## 6. O que funcionou bem

- Recusa honesta de saúde: pós-cirurgia, gestante, plus size ("Prefiro te falar a verdade…").
- Preços de kit e links batendo com o config.
- Injeção de prompt e pedido de 90% de desconto contidos.
- Recusa reconhecida, sem insistência.
- Comprovante de Pix tratado sem confirmar pagamento.
- Os fatos do produto certos (material, lavagem, cor, quadril, entregador, quem recebe).
- SP com o G e BH: link da entrega com frete grátis.

## 7. Ordem de conserto recomendada

1. **Estoque/anúncio (operador):** a tabela da §1. Sem isso, a maior parte das clientes do anúncio cai no antecipado.
2. **Link e nome (A1, A2, A8):** o link sai quando ela pede, com ou sem nome. O nome de duas palavras basta, sem "o resto" no link,
   e o antecipado nunca espera o CEP.
3. **Oferta (A3, A4):** a entrega só é prometida depois de tamanho e CEP. O cartão do antecipado diz o motivo certo (o tamanho, quando
   é o tamanho) e sem "Vamos agendar".
4. **Os cinco falsos vetos da §4**, com as frases desta rodada como prova (R21.6: são frases de persona).
5. **CEP novo e rua (A6, A7)**, mentira de LGPD (A9), link de terceiro (A10), cupom e "na maioria das regiões".

## 8. Rodada de verificação depois das correções (2026-10-25, HEAD `d2af322`)

25 conversas: as 20 fichas e as 5 compradoras que mais falharam, na mesma `turn` local, com o mesmo config e o mesmo modelo.

**Gasto.** R$ 1,15. O total da revisão passou a **R$ 5,18, R$ 0,18 acima do teto de R$ 5**. O executor confere o orçamento antes de cada
mensagem; com 10 conversas ao mesmo tempo, cada uma passou uma troca além do teto.

**O que melhorou** (contagem nas respostas da Malu; antes = 67 conversas da rodada 1, agora = 25):

| Defeito | Antes | Agora |
|---|---|---|
| "na maioria das regiões" | 8 | 0 |
| "não temos cupom" | 2 | 0 |
| "Claro! Você tem 7 dias…" (resposta pronta) | 13 | 1 |
| "me fala de novo o que você quer saber?" (fallback) | 4 | 0 |
| "nome completinho" / lixo no link | 4 | 0 |
| "apaguei" (LGPD) | 1 | 0 |
| "usa o mesmo link" (CEP novo) | 1 | 0 |
| reescritas por veto (nas mesmas 25 conversas) | 63 | 16 |
| turnos até o fim (nas mesmas 25) | 177 | 147 |

As compradoras fecharam mais rápido: venda-compra-forte em 4 turnos (eram 9) e venda-decidida em 4 (eram 7).

**Achado novo: o custo por turno subiu 45%** (R$ 0,0049 → R$ 0,0071), apesar de 75% menos reescritas. O total das 25 conversas foi de
R$ 0,87 para R$ 1,04.
- **Onde aparece:** antes, a maioria dos turnos depois do primeiro custava ~R$ 0,001–0,002, que é o preço com o cache do prompt. Agora a
  maioria custa ~R$ 0,008, que é o preço sem cache.
- **O que já foi descartado:** o prompt cresceu só 4,5% (42.601 → 44.542 caracteres). O ponto onde ele começa a variar continua em ~61%,
  igual à base.
- **Hipótese (não confirmada):** alguma parte que varia de turno a turno passou a mudar mais. As candidatas são o `freightBriefing`
  (frete do antecipado), o `scarcityBriefing` (estoque) e as diretivas de tamanho, nome e checkout, que ficam no meio do prompt e agora
  dependem da consulta pelo tamanho. Também pode ser variação do cache da Meta.
- **Conserto proposto:** mover tudo que muda por turno para o fim do prompt de sistema, para o prefixo estático continuar no cache.
  Medir com uma conversa antes e outra depois, lendo `llm_calls`.
- Isso precisa ser resolvido antes de escalar: a conversa longa está em R$ 0,07–0,08 só de Malu, contra a premissa de R$ 0,05 por lead.
