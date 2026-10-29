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

> **2026-10-29 ~15:00 UTC — FIM DA SESSÃO. COMECE AQUI: seção 14 de
> [`docs/operacao/estado-2026-10-28-fim-do-dia.md`](docs/operacao/estado-2026-10-28-fim-do-dia.md).** No ar: `turn` v48 (função v177,
> commit `1e4609c`, alarme `healthy`) + `business-config-2026-10-29b` (Coinzz no WhatsApp e no site, R$ 109,90, âncora R$ 179,90,
> cupom só no follow-up). PR #83 mesclado em `main`. Próximo: decisão do operador sobre o preço dos kits com cupom, pedido de teste pela
> Malu, templates da Meta, teste A/B de 5 dias (lista em ordem na seção 14).
> **Histórico** (todas as entradas anteriores, de 2026-09-10 a 2026-10-29, sem edição):
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

