# Revisão de riscos do PR #39 (2026-09-29)

Tarefa 2 do `HANDOFF.md`. Base: `main` em `6d585ed` (o #39 já mergeado); diff revisado
`c1c0cdf..6d585ed`. **Nada foi consertado nesta revisão**: cada achado é uma linha da tabela, e o
operador escolhe o que entra. Só entra na tabela achado com cenário **executado** (entrada →
saída observada); suspeita sem reprodução fica na lista do fim.

## Linha de base (passo 0)

| Comando | Resultado |
|---|---|
| `pnpm lint` | verde |
| `pnpm typecheck` | verde |
| `pnpm test` | 45 arquivos, 5079 testes, verde |
| `pnpm dev:conversas` | 360 conversas, 1640/1640 |
| `pnpm typecheck:function` (Deno 2) | verde (`turn` e `whatsapp`) |
| `tests/function-drift.test.ts` | 62/62; `cmp` de `src/agent/*.ts` × `supabase/functions/turn/*.ts`: idênticos (só `pacing.ts` não tem espelho, de propósito) |
| três cópias de `inbound-signature.ts` | mesmo md5 |

Ambiente: Node 22 (o `package.json` pede 24; só aviso). `pnpm dev:n8n` não roda aqui (sem a
chave do n8n); o passo 6 foi feito pela leitura dos JSON.

## Achados

| # | severidade | onde | o que acontece (entrada → saída observada) | causa raiz | correção proposta |
|---|---|---|---|---|---|
| 1 | alto | `src/agent/followups.ts:257` (`orderStatusAfter`) + `onOrderConfirmed` l.~345 | Webhook "Entregue" chega primeiro (o próprio PR trata esse caso), depois chega atrasado "created" ou "Em rota" do mesmo pedido. `orderStatusAfter("Entregue","created")` → `"created"`: o pedido volta a vivo-não-entregue no banco. `onOrderConfirmed([order_delivered agendado], …, "created", A)` → arma `order_confirmed`, `order_shipped`, `order_eve`. Na varredura, `orderTouchDue("order_eve","created")` → `true`: a véspera "sua entrega está marcada pra amanhã, deixa R$ 129,90 separado" sai **depois** da entrega — o bug que o PR declarou fechado. O estágio não regride (`furthest` segura `entregue_pago`), só o status do pedido e a régua. | `orderStatusAfter` só trata a morte como terminal; "entregue" também é terminal para a régua e não é protegido. Nenhum teste cobre "Entregue → status anterior". | `orderStatusAfter`: status guardado que `stageForOrder` lê como `entregue_pago` também não é sobrescrito por um que lê como `pedido_criado`/`em_rota` (morte continua podendo chegar depois: "Devolvido" pós-entrega é legítimo). Teste em `tests/order-stage.test.ts` + mutação em `verify-guards.ts`. |

| 2 | alto | `src/agent/guardrails.ts:2143` (`honest`) | `C` = "Pagando na entrega o frete é grátis: você paga só R$ 129,90 quando receber." `C + " No pix também, não se preocupe."` e `C + " No cartão também, fica tranquila que não tem pegadinha."` → **passam** a cadeia, caminhos cod e prepay, `codFreeShipping` ausente ou `true`. Na base (`c1c0cdf`) vetavam, porque a canônica vetava. | `honest(s)` aceita qualquer `nao`/`nunca`/`nem` em qualquer ponto da frase: a negativa que não nega (`.claude/memory/negation-blindness.md`) — o "não" nega "se preocupe", não o grátis. | Só é honesta a frase em que a negação governa o frete/grátis (`FREE_DENIED` ou `FREIGHT_DENIAL` já existem). As duas frases entram como mentira em `tests/honest-sales-lines.test.ts`, com mutação. |
| 3 | alto | `guardrails.ts:448` (`FREIGHT_CHARGED`) e `:2142` (`names`) | `C + " No pix também, o frete já sai zerado no checkout."` e `C + " Na oferta de R$ 116,91 também."` → **passam**, cod e prepay. | (a) `FREIGHT_CHARGED` lê a simples menção a `checkout`/`regiao` depois de `frete` como "cobrado", sem verbo de cobrança; (b) `names()` não reconhece o **preço** do antecipado como nome do caminho (o `moneyMatches` com `prepayBrl` já existe no arquivo, l.~596, e o laço de extensão não o usa). | (a) exigir `calculad`/`cobrad` não negado, tirar `checkout`/`regiao` soltos; (b) `names()` também por `moneyMatches` com `prepayBrl` e preços de kit do antecipado. |
| 4 | alto (pré-existente, mais provável agora) | `guardrails.ts:377` e `:2069–2077` (claim por `FREE_WORD`) | "No pix também é grátis." e "O frete no pix sai sem custo nenhum." → **passam** nas 8 combinações (`codFreeShipping` ausente/true/false, `freeShipping: true` × cod/prepay). Igual na base. | O claim só conta com `frete` a até 24 caracteres ou `entrega` logo antes; a resposta de sujeito oculto a "e no pix o frete é grátis?" não tem nenhum dos dois; `sem custo` não está em `FREE_WORD`. O PR passou a ensinar "grátis", o que torna o atalho mais provável. | Contar `gratis`/`gratuit`/`de graça`/`sem custo` em frase que casa `PREPAY_NAME`/`OTHER_PAYMENT` e não é negada por `FREE_DENIED`. Sondar antes a honesta vizinha ("no pix a troca é grátis"). |
| 5 | médio | `guardrails.ts:438` (`OTHER_PAYMENT`: `link`, `checkout`, `cartao` soltos) e `prompt.ts:198–200` | Caminho cod: `C + " Te mando o link?"` e `C + " Na porta você pode pagar em dinheiro ou cartão."` → **vetadas** (`shipping_promise`). Idem "Aceita dinheiro ou cartão na hora da entrega." e "Entrega em 1 a 3 dias, agendada — quem escolhe o dia é você, no checkout." — frases que o próprio prompt ensina (`prompt.ts:467–469`). O §33 não lista esse custo nem o `COSTS_A_REWRITE`. E o prompt manda dizer "o frete é calculado no checkout" em toda frase que fale do **link**, o que é falso no link da entrega (frete R$ 0,00). | `OTHER_PAYMENT` recoloca sem preposição o que o comentário de `PREPAY_NAME` (l.359–361) exclui de propósito: "dinheiro ou cartão" é pago na porta, "te mando o link" vale para os dois caminhos. | Deixar em `OTHER_PAYMENT` só as formas com preposição, como `PREPAY_NAME`; `prompt.ts:198` passa a "do antecipado, do pix, do cartão online, do site". Se o operador preferir manter o veto: registrar no §33 e em `COSTS_A_REWRITE`. |
| 6 | baixo | `tests/gate-loosen-accepted.txt` | 20 das linhas que o PR acrescentou **já não afrouxam** (`comm` entre a saída de `pnpm dev:gates` e o diff do arquivo), p.ex. "O frete é grátis e você só paga quando receber.", "Frete grátis, R$ 129,90 na entrega." | O aceite é por `gate\|frase`, sem contexto, e continua valendo depois que §32–§33 voltaram a vetar essas frases: se uma mudança futura as liberar, `--fail-on-loosen` aceita calado. | Tirar as 20 linhas, ou o `gate-diff` falhar em aceite sem afrouxamento correspondente. |

Achados 2–6: revisão do `code-reviewer` (Opus) sobre o diff de `guardrails.ts`/`prompt.ts`,
**reproduzidos de novo pela sessão principal** antes de entrar aqui (2, 3, 4 e 5, com o
`business.example.json` e com `codFreeShipping` ausente). Veredito dele: **reprovado** — 2 e 3 são
mentiras de frete grátis no antecipado que só passam por causa deste PR.

**Contagem:** 0 crítico · 4 alto (1, 2, 3, 4) · 1 médio (5) · 1 baixo (6).

## Gate de frete e desempenho (passos 4 e 5)

- `pnpm dev:gates`: 4902 frases × 12 contextos; **afrouxou 62, todas com aceite**; endureceu 43.
  Os 34 afrouxamentos de `shipping_promise` são a frase canônica, variantes dela, ou a negação
  honesta do antecipado, com motivo em R15.3 e §29–§33, e são verdade da operação. Os de
  `delivery_promise`, `warranty_promise` e `unverified_size` também têm motivo (R3, §30, §32).
- Sondas pedidas no passo 4: "frete grátis" sem caminho, "sem frete no pix", "o frete é grátis" no
  antecipado, "frete grátis no cartão", "entrega grátis pra todo o Brasil", "frete por nossa
  conta", "não cobramos frete", "o frete sai de graça pagando antecipado", canônica + "No pix
  também." → **vetam** com `codFreeShipping` ausente, `true` e `false` (passam só com
  `freeShipping: true`, que é "grátis nos dois caminhos" por definição). A exceção é "no pix
  também é grátis" (achado 4). Canônica de kit passa com `units` 2/3.
- Prompt × gate: `freightBriefing` e o briefing do gate usam o mesmo teste (`freeShipping ===
  true`, depois `codFreeShipping !== false`). Com `false` o prompt volta ao texto de 22/09 e o gate
  veta a canônica; com `freeShipping: true` nenhum texto ensina a canônica. Coerente, fora o achado 5.
- Desempenho: pior caso **45 ms** (`"pagando ".repeat(5000)+"na entrega"`, 40 mil caracteres);
  `"a ".repeat(8000)`, `"grátis na entrega. ".repeat(800)`, `"não ".repeat(5000)` e sequências
  feitas para as regex novas entre 11 e 36 ms. Sem backtracking catastrófico.
- Comentário desatualizado: `prompt.ts:174` ainda diz que basta nomear o caminho para liberar o
  grátis; desde §32 é a lista fechada de frases canônicas. Sem efeito em execução.

## Cenários do ciclo do pedido (passo 3), resultado real

Executados com as funções de `src/agent/followups.ts` e `state-machine.ts` (teste descartável,
apagado) e lidos contra `recordOrder`/`scheduleSilenceTouches`/`sweepRow` de `index.ts`.

| Cenário | Resultado observado | Veredito |
|---|---|---|
| a. compra → ela escreve de novo | `chasesSilence("pedido_criado",["created"])` = false; com `endereco_coletado` e pedido vivo também false; `scheduleSilenceTouches` cancela silêncio **e** `checkout_reminder` e não arma nada; a varredura confere de novo antes de enviar | ok |
| b. `Entregue` chega | com a régua armada: cancela `order_shipped`, `order_eve`, arma nada; como primeiro webhook: arma só `order_delivered` | ok |
| c. `Cancelado` antes de `Em rota` | `furthest(x,"recusado")` = `recusado` para `novo`, `conversando`, `endereco_coletado`, `perdido`, `pedido_criado`, `em_rota`; fica `entregue_pago` e `bloqueado` (terminais) | ok |
| d. cancelado, depois `Em rota` atrasado | status continua "Cancelado", efeito vazio | ok |
| e. dois pedidos, um morto e um vivo | `stageForLead` = null (não trava em `recusado`); `chasesSilence` = false; `orderTakeOver` move `order_eve`/`order_delivered` para o vivo; `reopensRefused` = true | ok |
| f. mesmo webhook duas vezes | segundo não arma nada (e o upsert é `ignore-duplicates`) | ok |
| f. fora de ordem ("Entregue" → "created"/"Em rota") | ver achado 1 | **achado** |
| g. `perdido` que compra depois | `furthest("perdido","pedido_criado")` = `pedido_criado` | ok |

## Opt-in, selo e n8n (passo 6)

- `turno-da-agente.json`: "Cerebro do turno" e "Resposta de verdade" repassam `reply`. ok.
- Com `channel.askMarketingOptIn` ausente: `ASK_OPT_IN` é false; a varredura não seleciona as
  colunas da 0019; `marketingOptIn` do render é false (então `silence_2`/`silence_3` nunca saem como
  template); no turno, sem `nonce` gravado não há resposta de botão válida e a suspensão só é
  escrita se já houver consentimento. Nada é perguntado nem escrito. ok.

## Config e produção (passo 7)

- `config/business.example.json`: `freeShipping: false` + `codFreeShipping: true`, coerente com
  R15.3. Prompt × gate: ver passos 4 e 5 acima.
- **Pergunta ao operador (bloqueia o deploy da `turn`, não este PR):** o secret `BUSINESS_CONFIG`
  de produção ainda tem `freeShipping: true` escrito? O próprio `_comment` do exemplo diz que
  sim (texto de 22/09) e o `HANDOFF.md` nunca registrou o O1 como feito. Com `true`, a v-próxima
  diz "frete grátis" **também no antecipado**, que cobra frete por região. Conferir sem imprimir
  o secret; se estiver lá, apagar a chave (ausente = grátis só na entrega).
- Migrações: nenhuma nova no PR.

## Risco condicionado ao vocabulário das plataformas (não reproduzido na porta)

- `stageForOrder` lê `\bentregue\b` em qualquer lugar do status: "Entregue à transportadora",
  "Entregue ao transportador", "Pedido entregue ao correio" → `entregue_pago`. Pré-existente, mas
  desde este PR esse estágio também **cancela** confirmação, envio e véspera. Nenhum documento
  do repositório lista o vocabulário real da Logzz/Coinzz; se algum desses status existir, a
  cliente perde os avisos do trajeto e o funil conta entrega que não houve. Conferir contra um
  payload real antes de tráfego.
- `recordOrder` cancela com `PATCH followups?conversation_id&kind` sem `status=eq.scheduled`:
  uma linha que a varredura acabou de marcar `sent` pode virar `canceled` na corrida.
  Pré-existente; só afeta o registro, não o envio.
