# Cruzamento: o agente × a documentação (Fases 1 e 2, 2026-09-29)

Tarefa 3 do `HANDOFF.md`. Base: `main` em `6d585ed` (PR #39 mergeado). **Só inventário: nada foi
consertado.** Cada divergência espera a decisão do operador (Fase 3), com a pergunta no fim.

## O que o agente diz (Fase 1)

- [`prompt.txt`](prompt.txt): `systemPrompt(cfg, gateBriefing(cfg), null)` com
  `config/business.example.json`. O prompt **não varia por caminho de pagamento** (a assinatura não
  recebe o caminho); o que varia por turno são as diretivas de `supabase/functions/turn/index.ts`
  (`sizeDirectiveFor` l.~668, identidade, checkout, `OPT_OUT_FAREWELL_DIRECTIVE` l.1194). Com
  `delivery.codFreeShipping` ausente o texto é idêntico (conferido por `diff`).
- [`gate-briefing.txt`](gate-briefing.txt): o bloco "A VERIFICAÇÃO DA LOJA".
- Textos sem modelo: `renderFollowup` (`src/agent/followups.ts:546`), `SILENCE_1/2`,
  `CHECKOUT_REMINDER` (l.428–463), e em `src/agent/retry.ts` `SAFE_FALLBACK_REPLY`,
  `HOLDING_REPLY`, `HUMAN_HANDOFF_REPLY`, `ORDER_HANDOFF_REPLY`, `THINK_REPLY`,
  `WELCOME_AUTO_REPLY` (l.121–241).
- **Atenção:** o exemplo não é o secret. Tudo que depende de valor (escassez, depoimentos,
  `freeShipping`) precisa ser conferido contra o `BUSINESS_CONFIG` real pelo operador.

Toda frase marcada "mentira" abaixo foi passada por `runGates` (teste descartável, apagado) com o
config do exemplo; a coluna diz se a cadeia **passa** (furo real) ou **veta**.

## Divergências (Fase 2)

Vereditos: **igual** · **mentira** (o agente pode afirmar o que a doc/operação não sustenta) ·
**ocioso** (existe e o agente não usa) · **fantasma** (o agente usa o que não existe) · **doc
desatualizada** (o agente está certo, a doc não).

### Graves — o agente pode dizer algo falso, e a cadeia de gates deixa passar

| # | tema | o agente diz | a documentação diz | veredito | `runGates` |
|---|---|---|---|---|---|
| D0 | 2. frete | Com a frase canônica do grátis na entrega seguida de "No pix também, não se preocupe." / "No pix também, o frete já sai zerado no checkout." / "Na oferta de R$ 116,91 também.", ou sozinha "No pix também é grátis." | R15.3: antecipado **nunca** grátis. | mentira | passa, cod e prepay — detalhe e causa em [`../08-mudancas/revisao-pr39.md`](../08-mudancas/revisao-pr39.md) achados 2–4 |
| D1 | 3. prazo / 10. régua | `order_eve` (`followups.ts:591`), armado por relógio a pedido+30h (`scheduleOrder` l.197), para **os dois caminhos**: "Sua entrega está marcada pra **amanhã**". No antecipado só some a linha do preço. | Antecipado: "varia por região, em média 5 dias úteis" (`01-produto-e-oferta.md:15`, R9.3). COD: 1 a 3 dias, **dia escolhido por ela** no checkout (`01-produto-e-oferta.md:15`); o dia chega no webhook (`date_delivery` → `orders.scheduled_for`, `n8n/workflows/venda-confirmada.json`) e **nenhum código lê `scheduled_for`**. | mentira | passa (prepay, `logistics`) |
| D2 | 10. régua | `order_shipped` a pedido+24h, por relógio: "Seu colete já está a caminho 🚚 Assim que a transportadora agendar o dia, eu te aviso". | A régua deveria seguir o status (`05-decisoes-firmes.md` §8: "durante o trajeto"); no COD o dia **já foi escolhido por ela** no checkout, então "assim que a transportadora agendar" contradiz o prompt ("quem escolhe o dia é ela"). | mentira | passa (cod, `logistics`) |
| D3 | 6. pagamento / 4. praças | `silence_1` `after_price` (`followups.ts:434–435`): "você não paga nada agora — o pagamento é só quando o colete chegar na sua mão"; `silence_2` (l.461): "você vê, veste, e só paga se estiver tudo certo". A varredura julga o toque como `cod` a menos que ela tenha **escolhido** o antecipado (`index.ts:1373–1375`); a praça sem entrega não é gravada no lead (a região é recalculada a cada turno, l.2524). | Fora das 22 praças o único caminho é o antecipado, pago antes (`07-cobertura/01-…md`). `05-decisoes-firmes.md` §2: não afirmar que não haverá cobrança antes da entrega quando ela existe. | mentira (para lead de praça sem entrega) | passa com `cod` **e com `prepay`** — o gate de cobrança não veta "não paga nada agora" no caminho antecipado |
| D4 | 6. pagamento | Mesmas frases de D3, no COD: "você recebe, veste com a sua roupa, se olha no espelho — e só então decide"; "você vê, veste, e só paga se estiver tudo certo". | A LP diz "você **vê** o produto e paga na hora. Não gostou? Não fica com ele" (`01-base-de-conhecimento.md:135`, :97). Nenhum documento diz que o entregador espera ela vestir antes de receber. | a confirmar (mentira se o entregador não espera) | passa ("Você pode experimentar antes de pagar o entregador." também passa) |
| D5 | 5. garantia | Prompt (objeção "medo de errar o tamanho") e briefing: "a gente devolve o seu dinheiro sem custo nenhum"; "na devolução o dinheiro volta sem custo nenhum pra ela". | Nenhum documento diz quem paga o frete de volta. A LP diz "a gente troca ou devolve o valor" (`01-base-de-conhecimento.md:98`), sem "sem custo". A frase entrou no código em 25/09 sem decisão registrada (R13.5 não a contém). | fantasma (sem fonte) | passa |
| D6 | 8. escassez | "URGÊNCIA REAL: restam 12 unidades" (`scarcity.unitsLeft: 12`, `allowUnverified: true`). | Não existe contagem real de estoque (R13.6). R14.6 **propôs** o secret de produção sem `scarcity`, "a confirmar no deploy". `05-decisoes-firmes.md` §5 fala de outra escassez (contador de 1 dia e 8 horas do site). | depende do secret | passa ("Restam 12 unidades.") |

### Médias — conflito entre documentos, ou texto que confunde

| # | tema | o agente diz | a documentação diz | veredito |
|---|---|---|---|---|
| D7 | 2. frete | "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber." (R15.3, 28/09) | A fonte de **maior precedência**, `05-decisoes-firmes.md` (último item), diz "a operação não oferece frete grátis em nenhum dos dois caminhos" (22/09). Idem `01-produto-e-oferta.md:16`, `06-script/02-script-do-agente.md:376` ("Frete grátis" na lista de frases que nunca saem) e `02-especificacao/04-guardrails.md`. | doc desatualizada (as quatro) |
| D8 | 9. identidade | `WELCOME_AUTO_REPLY` (`retry.ts:237`): "em poucos minutos uma de nossas **atendentes** esclarecerá todas as suas dúvidas" — e quem responde é a assistente virtual. | O prompt proíbe se passar por pessoa. A pendência "texto da recepção automática (hoje promete 'atendentes')" está aberta desde 24/09 (`05-plano/00-plano-simples.md:167`). A LP promete "WhatsApp com gente de verdade. Não é robô" (`01-base-de-conhecimento.md:99`), conflito já registrado como decisão em aberto. | mentira de canal (texto fixo, fora da cadeia de gates) |
| D9 | 8. prova social | Aponta "a seção de depoimentos do nosso site" (R13.5). | Os depoimentos do site são **reconstruções** (`05-decisoes-firmes.md` §7); o agente não deve apresentá-los como verificados. Apontar para eles não afirma que são reais, mas os usa como prova. | a confirmar |
| D10 | 4. praças | A consulta de região bate no endpoint da **Coinzz** (`availability.ts`, `AVAILABILITY_ENDPOINT`); o checkout da entrega é a **Logzz** desde 25/09. | `07-cobertura/01-…md`: cobertura medida no checkout da Coinzz (21/09), com frete de R$ 24,98 que o checkout da Logzz não cobra (R15.3). O comentário do n8n (`venda-confirmada.json`) ainda diz "Both checkouts are Coinzz since 2026-09-25", ao contrário do `_comment` do config. | a confirmar (mesma rede Logzz por trás?) + doc desatualizada |
| D11 | 7. tamanho | Prompt: "Não peça fita métrica". | `02-tabela-de-medidas.md:44–46`: a agente **oferece** a medição como caminho mais preciso, sem exigir. | ocioso (decisão de 04/09 × prompt) |
| D12 | 8. claims | Briefing veta "melhora postura". | `01-produto-e-oferta.md:29` ("dá apoio de postura") e a comparação da LP ("Segura a postura: sim"). | igual no efeito (o agente é mais restrito que o site); decidir se o site deve mudar (regra de anúncio) |

### Baixas — só documentação

| # | onde | o que está velho |
|---|---|---|
| D13 | `02-especificacao/04-guardrails.md:29,35` | preços R$ 110,41 / R$ 19,49 / 15%; antecipado "3 a 10 dias úteis" (hoje: 10%, R$ 116,91, média de 5 dias úteis, economia em reais proibida) |
| D14 | `01-produto-e-oferta.md:19`, `05-decisoes-firmes.md` (pendências) | "Checkout: Coinzz", "Físico na entrega ativo na Coinzz" (a entrega é Logzz desde 25/09); `PREPAY_DISCOUNT` do site ainda em 5% desligado |
| D15 | `supabase/functions/turn/index.ts:119,470` | caminho de chamada à OpenAI ainda no código (R12.1: só a Meta). Não afeta o que ela ouve |

### Iguais (conferidos)

Preços de 1/2/3 peças nos dois caminhos e percentuais (config × prompt × briefing); âncora
R$ 216,50 = 40%; parcelamento só no antecipado, até 12x, nunca "sem juros" (R13.3); garantia 7
dias após o recebimento (LP e CDC); tabela de medidas e desempate "o maior" (`sizing.ts:22–44`);
"não emagrece" dito em voz alta; "mais de 500 clientes satisfeitas" e loja em São Paulo (R14.6);
suporte todo dia (R13.5); CPF pela nota fiscal (R13.5); Expressa desligada; cupom inativo e
`silence_3` mudo; nada de WAHA, OpenAI ou Gemini no que ela lê.

## Perguntas ao operador (Fase 3) — uma por divergência

1. **D1/D2:** a véspera e o "a caminho" devem seguir o **status e a data** do pedido
   (`scheduled_for`) em vez do relógio? E no antecipado, a véspera sai (só com data conhecida) ou
   não sai?
2. **D3:** para quem está numa praça sem pagamento na entrega, os toques de silêncio podem falar
   de pagar na entrega? (Proposta: gravar a praça no lead e escolher o texto pelo caminho.)
3. **D4:** o entregador da Logzz espera ela **vestir** antes de pagar, ou só entregar e receber?
4. **D5:** na devolução em 7 dias, quem paga o frete de volta? A frase "sem custo nenhum" fica?
5. **D6:** o secret de produção tem `scarcity`? "Restam 12 unidades" fica?
6. **D7:** posso corrigir os quatro documentos para a R15.3 (frete grátis só na entrega)?
7. **D8:** qual o texto novo da recepção automática, sem "atendentes"?
8. **D9:** apontar para os depoimentos reconstruídos do site continua?
9. **D10:** a cobertura da Coinzz é a mesma da Logzz? Rodar a varredura contra o checkout da Logzz?
10. **D11–D15:** correção só de documentação/código morto — posso fazer sem decisão de negócio?

## Situação em 2026-09-29, noite (Fase 3: respostas do operador e consertos)

| # | Divergência | Decisão | Onde foi fechada |
|---|---|---|---|
| D0 | frete grátis "no pix também" passava | R15.3 | gate `shipping_promise` (`honest`, `FREIGHT_CHARGED`, preço do antecipado, grátis sem "frete") |
| D1 | véspera por relógio | R16.1 | régua: véspera só com `scheduled_for`, na véspera em SP |
| D2 | "a caminho" por relógio | R16.1 | régua: `order_shipped` pelo status; texto sem "transportadora agendar" |
| D3 | praça sem entrega ouvia "não paga nada agora" | R16.2 | praça gravada no lead; régua e gate pelo caminho (`codUnavailable`) |
| D4 | "veste e só paga se estiver tudo certo" | R16.4 | textos da régua reescritos; gate veta vestir antes de pagar |
| D5 | devolução "sem custo nenhum" sem fonte | R16.3 | é verdade; fica |
| D6 | "restam 12 unidades" em qualquer mensagem | R16.5, R16.8 | só na resposta ao "vou pensar" (`thinkReply`); gate veta no resto |
| D7 | documentos negavam o frete grátis na entrega | R15.3 | `05-decisoes-firmes`, `01-produto-e-oferta`, spec de guardrails |
| D8 | recepção promete "atendentes" | mantida pelo operador | sem mudança |
| D9 | depoimentos reconstruídos do site | R16.7 | só quando ela pedir (prompt e briefing) |
| D10 | cobertura Coinzz × Logzz | resolvida | é a operação da Logzz, lida pelo endpoint público; sondado SP e Manaus |
| D11 | fita métrica | doc atualizado | `02-tabela-de-medidas.md` |
| D12 | postura (site × agente) | R16.6 | prompt ensina "ajuda na postura"; gate segue vetando corrigir/tratar |
| D13–D14 | spec e produto com dados velhos | doc atualizado | idem D7 |
| D15 | caminho OpenAI no código | rollback documentado da v32 | sem mudança |
| — | confirmação do antecipado com prazo | R16.1 | `order_confirmed` do antecipado: data do pedido ou média do config |
| — | cancelamento/devolução pela API | R16.9 | APIs não expõem; segue handoff |
