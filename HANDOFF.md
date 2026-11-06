# Handoff

Estado atual do projeto, para trocar de sessão sem perder o fio.

> Este repositório (renomeado para **Ricos-com-IA**) é onde vive o contexto do
> agente — negócio, pesquisa, especificação, decisões — e onde o agente de IA
> de vendas via WhatsApp está sendo construído. `colet-cinta-modeladora`
> (renomeado para **Encorpa-Website**) guarda só o site oficial da Encorpa
> (landing page, checkout). `encorpa-campanhas` guarda Meta Ads, atribuição de
> CTWA e Conversions API — saiu deste repositório em 2026-09-08, ver
> §Separação de repositórios. Se um dia divergirem sobre negócio, **este
> repositório é a fonte**.

## ▶ COMECE AQUI — quadro de execução do pipeline 80/20 (atualizado 2026-10-11)

> **2026-11-06 (3ª sessão, teste geral antes dos anúncios) — COMECE AQUI.** Grafo §150.
> - **Sistema: pronto.** CI inteiro verde (9572 testes, 1655 conversas, gates sem mudança, Deno ok), portal 100/100, `turn` e config no
>   ar = repositório, n8n 8/8 ativos sem erro, saúde `healthy`, webhooks recusam chamada falsa, site com pixel e coletor, checkouts com o
>   preço do config, 4 conversas reais de ponta a ponta sem defeito que bloqueie.
> - **Bloqueio de negócio: estoque.** Coinzz em 06/11 (`docs/operacao/cobertura-coinzz-2026-11-06.txt`): **M e G não vendem em
>   nenhuma cidade** (nem antecipado); entrega só XGG (20 cidades), GG (9), P (4). Decisão do operador antes de ligar os conjuntos.
> - **Não testado:** WhatsApp real (última conversa real 04/11, ok), Meta Ads, compra no Gerenciador de Eventos, estoque da Logzz.
>
> **2026-11-06 (2ª sessão, véspera da fase 1) — COMECE AQUI.** Conferido 06/11 (grafo §149):
> - **Fase do teste:** nenhuma. A fase 1 começa amanhã, **sáb 07/11**; hoje não há regra de pausa nem de escolha a aplicar.
> - **Supabase:** 0 leads e 0 pedidos desde 07/11 (nem desde 28/10: 1 lead, 0 pedidos). **Caixa:** R$ 576 intacto (+ R$ 200 a partir de 14/11);
>   0 pedidos na entrega, R$ 0 adiantado.
> - **Meta Ads: não lido.** Sem `META_ACCESS_TOKEN` neste ambiente (o token só existe no Vercel do portal) e sem `PORTAL_TEST_LOGIN`. A partir de
>   07/11, o gasto e o CTR por vídeo saem do portal (período 07–13/11) ou de uma sessão com o token.
> - **Pendente (3), carrinho:** o único carrinho no banco (lead de 28/10, 2 unidades) tem `checkoutUrl` nulo, mas foi gravado **antes** de
>   `cartCheckoutUrl` (commit `59dffe3`, 29/10); hoje 2 unidades viram `…/checkout/encorpa-site-0` do kit. Continua aberto até o 1º carrinho real.
> - **Pendente (4), compra no Gerenciador de Eventos:** aberto — ainda não houve pedido.
> - **Hoje:** o sócio deixa os dois conjuntos (Site e WhatsApp) agendados para começar 07/11 00:00, R$ 17,86/dia cada, os 5 vídeos, as 22 cidades.
>   **Próximas datas:** 09/11 (dia 3, R$ 50: pausa o conjunto que estourou limite), 11/11 (dia 5, R$ 75: pausa o sem pedido), 13/11 (2 vídeos).
>
> **2026-11-06 — COMECE AQUI (sessão de 06/11, só plano e documentação; a `turn` não mudou).**
> - **Teste A/B em duas fases** (§148): **fase 1, criativos, sáb 07/11 a sex 13/11** (5 vídeos, R$ 250, R$ 17,86/dia por conjunto; dia 3 = 09/11,
>   dia 5 = 11/11); em 13/11 passam os **2 vídeos de maior CTR do link** (somando os dois conjuntos, com pelo menos R$ 15 gastos cada; empate pelo
>   menor CPC). **Fase 2, oferta, sáb 14/11 a sex 20/11** (os 2 vídeos, mais R$ 250, o mesmo A/B Site × WhatsApp; dia 3 = 16/11, dia 5 = 18/11;
>   vence ≤ R$ 27 por pedido criado e leva o capital).
> - **Caixa** (§147–§148): R$ 576 + R$ 200 (disponíveis desde 14/11). Cada pedido na entrega adianta ~R$ 61 até o 1º repasse (~22 a 24/11); se as
>   duas fases baterem a meta, o caixa acaba no fim da fase 2. Os R$ 500 de anúncio vencem na fatura de 29/11.
> - **Especificação para o sócio:** PDF gerado na sessão (não versionado); o conteúdo é o §140, §145 e §148.
> - **Próximo:** acompanhar 09/11 e 11/11 no portal (período 07–13/11); em 13/11 escolher os 2 vídeos; subir a fase 2 em 14/11.
> - **Portal:** `npm test` só passa depois de `npm ci` (sem `node_modules` dá 3 falhas de módulo ausente; com ele, 100 ok em 06/11).
>
> **Histórico** (todas as entradas anteriores, desde 2026-09-10, sem edição; a mais nova no topo):
> [`docs/operacao/handoff-historico.md`](docs/operacao/handoff-historico.md) — não se lê inteiro; procure com `grep`.
> Nova entrada de estado entra no topo desta seção; a anterior desce para o histórico.

### Regra de toda sessão que continua o pipeline

**Ao começar**, antes de qualquer trabalho:
1. Conferir o estado real, não o escrito: `git log origin/main`, PRs abertos, o que está no ar
   (versão da `turn`, `CANAL_ATIVO`, última execução da Action `Hermes`).
2. Atualizar as três partes abaixo — **onde estamos**, **executado**, **falta** — se algo mudou
   desde a última sessão (o operador ou o sócio podem ter feito etapas fora de sessão).
3. Dizer ao operador, em até cinco linhas: a etapa atual, o que foi executado desde a última
   sessão e o próximo passo.

**Ao terminar**, atualizar o quadro de novo, com data e evidência (commit, PR, execução, print).
Etapa sem evidência não vai para "executado". Nada de apagar linha: a etapa feita muda de lista.

Legenda: ✅ feito · 🔄 em andamento · ⬜ não começado · ⛔ bloqueado (diz por quê).
### Executado

| Etapa | O quê | Evidência |
|---|---|---|
| — | Auditoria do repositório (revisões 1 e 2) e pipeline 80/20 | PR desta branch (`claude/eager-sagan-qn74um`), 2026-09-29 |
| — | Troca de tamanho não é grátis (R17.1), no código | PR #42 mergeado (`75c22c8`), 2026-09-29 |
| — | ~~Valor da troca cobrado da cliente~~ — superado: troca/devolução pelo suporte da Logzz, sem custo (R21.2–R21.4, 2026-10-13) | `03-decisoes-tomadas.md` R21 |
| — | `BUSINESS_CONFIG` colado pelo operador (sem `exchange`) e `order_shipped`/`order_delivered` agendadas canceladas | operador, 2026-09-29 (fila do PR #42) |
| L0.6 | Merge do PR #43 (Hermes v1); migração `0020` aplicada em produção | `5bf5a15`, 2026-09-29 |
| L0.3 | Decisão: formulário n8n (R17.3). Construído: `job: "human_reply"` na `turn`, `checkHumanReply`, workflow `n8n/workflows/responder-cliente.json`, regra de senha no `dev:n8n`; grafo §43; revisão Opus consertada | `claude/awesome-carson-p64spq` (`c7e14f0`), 2026-09-30 |
| L0.3 | PR #45 mergeado; CI do `main` verde | `a9ba28a`, CI run 108 `success`, 2026-09-30 |
| L0.3 | `turn` v44 publicada; "Responder cliente" importado e ativo com senha; teste com telefone inexistente voltou "Nenhuma conversa com esse telefone" (operador); `dev:n8n` `ok` | v44, workflow `3Q18SjoW0UUXrTPI` versão ativa `d5659dab`, 2026-09-30 |
| L0.4 | `BUSINESS_CONFIG` colado pelo operador | operador, 2026-09-30 |
| L0.7 | Hermes instala na Action pelo instalador oficial no commit fixado (grafo §45); execução manual 8 verde: `Hermes Agent v0.21.5+2011.gac4181f`, `hermes_backlog` lido com os segredos da Action (`0 leads … espera 50`). R17.2 (troca cobrada da cliente, superada pela R21.2–R21.4) nas decisões e no grafo §39 | run `36768879175`, `d94a2b2`, 2026-09-30 |
| — | Cupom só no follow-up (R17.4): `turnConfig` + `sent_at` só no envio; grafo §44; revisão Opus aprovada com resíduos | `4e33ff7`, `a55343f` na branch `claude/nice-gates-2yer56`, 2026-09-30 |
| L0.4 | `BUSINESS_CONFIG` completo entregue ao operador, com as decisões de 30/09: `coupon.active` true (SUPER20, para o `silence_3`), sem `testimonials`, `scarcity` mantida, teto fixo R$ 0,50 (`overrunTolerance` 0 — o teto real é `cap × (1 + tolerância)`) | operador, 2026-09-30 |
| — | R17.4 mergeado (PR #47) e publicado: `turn` v46 do `41203ba`, mesmo `ezbr_sha256` da v45 | `41203ba`, CI run 117 `success`, v46 21:00:08 UTC, 2026-09-30 |
| L1.2 | Segredos `CONVERSATION_MODEL`/`CONVERSATION_MODEL_PRICE` removidos → modelo padrão na `turn` v46; sonda `function` (cleide, 2 turnos, R$ 0,15) | 2026-10-01 |
| L1.1 | Turno, Relógio, Venda e Envio do `main` publicados no n8n pela API; `dev:n8n` `ok` nos seis. "Devolve a resposta" do Turno movido acima do ramo do Wait (respondia só depois dos 120 s, 502 para quem chama) + regra no `dev:n8n`; grafo §46; revisão Opus aprovada com resíduos | versões ativas acima, 2026-09-30 |
| L0.5 | Rodada das 12 personas no modelo padrão: p50 R$ 0,268 · p95 R$ 0,546 · máx R$ 0,546; 3/12 no teto; vetos e piores no topo do quadro | rodada `2026-09-30T21-08-04-483Z-local`, `41203ba`, 2026-09-30 |
| L3 prep | Mês 1, onda 1 (§4a, §4b, §5, §7) — PR #50; 314/314 mutações; revisão Opus aprovada com resíduos | `6a4bb29`, 2026-10-02 |
| L3 prep | Mês 1, onda 2 (§6) — e-mails, Rotina `DECIDIR.md`, reversão; simulação da régua no CI | PR #50, `b0ae69d`, 2026-10-02 |
| L3 prep | 0021/0022 aplicadas; `agent_version` 1 no ar e sondada pela porta do n8n (régua 63–71 h, 1 minuto, versão por turno) | `turn` v51, `2ef7b03`, 2026-10-05 |
| L3 prep | Rotina "Hermes – decisão" criada | `trig_01SR8fhPWmJktwR8oVTfd3gV`, 2026-10-05 |
| L0.5 | Teto R$ 0,55 / tolerância 0 colado no `BUSINESS_CONFIG` | operador, 2026-10-05 |
| — | Rodadas de personas v1 (`function`) e v2 (`local`); `agent_version` 2 (cancelar → pessoa, `order_action_claim`) e 3 (`shipping_promise` ao lado de "isso mesmo", "guardando seu M") | PR #51, `turn` v53 e v55, 2026-10-05 |
| L0.4 | ~~Cobrança da troca por link~~ — superada: troca/devolução pelo suporte da Logzz, sem custo; link e valor apagados (R21.4, 2026-10-13) | operador, 2026-09-30 |
| L0.1, L1.3–L1.5 | Canal no ar: número de produção recebendo e respondendo pelo WhatsApp Cloud API (testes reais do operador e de amigos) | conversas 06/10 ("Leila"), 07/10 ("Leila 2", amigos 7967 e 9393), 08/10 (áudio) |
| — | `whatsapp` v19: áudio da cliente transcrito (Meta ASR); provado pelo operador com nota de voz | 2026-10-08 |
| L4 prep | Hermes ganha histórico inicial (`hermes/historico-inicial.md`, lido como `historico.md` depois de `decisoes.md`): ordem de diagnóstico e os casos §60–§66 com causa → conserto → guarda | `1cf59eb`, 2026-10-08 |
| — | `size_insist`: número da calça no máximo 2× seguidas (Neusa) — **não publicado**, vai na v14 | `4dcf779`, 2026-10-08 |
| — | Lead do operador (final 5983) e lead sintético de 25/09 apagados para novo teste; amigos (9393, 7967, 7745) mantidos até a auditoria | 2026-10-08 |
| — | `turn` v13 (agent_version 13, função v86): achados baixos do §66, `cep_insist` em sequência, parcelamento numa frase só; sonda sem selo 401 | `2782249`, 2026-10-08 |
| — | `turn` v12 (agent_version 12, função v84): segundo teste real consertado (grafo §66), revisão completa, decisões 16–18, migração 0024 (sem e-mail) | `87e2922`, 2026-10-08 |

### Falta (na ordem do plano)

| Etapa | O quê | Dono | Estado |
|---|---|---|---|
| L0.1 | Parte A do canal: app, número, nome de exibição, token | S | ✅ canal no ar (testes reais 06–08/10) |
| L0.2 | Submeter o template `order_eve` (UTILITY) | S | ⬜ |
| L0.5 | Operador fixa o teto pelo p95 da rodada (R$ 0,546) | O | ✅ R$ 0,55 / tolerância 0 no `BUSINESS_CONFIG`, 2026-10-05 |
| L1.1 | Importar os workflows do `main` no n8n; `pnpm dev:n8n` passa | C | ✅ 2026-09-30 |
| L1.2 | `CONVERSATION_MODEL` = modelo padrão | C | ✅ 2026-10-01 |
| L1.3 | Parte B do canal: segredos no Supabase, publicar `turn` e `whatsapp` | O | ✅ `turn` v12/v13 e `whatsapp` v19 no ar, 2026-10-08 |
| L1.4 | Webhook da Meta apontando para a função `whatsapp` | S | ✅ mensagens reais chegando, 06–08/10 |
| L1.5 | Parte C do canal: credencial, `PHONE_NUMBER_ID`, `CANAL_ATIVO=true`, fechar as portas | C | ✅ na prática (canal respondendo); conferir `CANAL_ATIVO` e portas na próxima sessão |
| L2 | Três conversas reais: compra na entrega, compra antecipada, troca + handoff respondido | O + C | 🔄 testes reais de 06–08/10 consertados (§65, §66); falta uma compra concluída em cada caminho e a troca + handoff |
| L3 | Tráfego controlado nas 22 praças; piso de amostra assinado; critérios de pausa | S + O | ⬜ |
| L4 | Hermes com H1–H5 (instala, segredos, rotina de implementação, vê pedido, piso assinado) | C + O | ⬜ |

