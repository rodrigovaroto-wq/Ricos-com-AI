# Mapa do repositório — onde está cada coisa

Porta de entrada para achar informação sem ler as ~3.200 linhas do `HANDOFF.md`. Atualizado em
2026-10-08 (branch `claude/gracious-hopper-9a79su`, PR #56; contagens conferidas no repositório nessa data).
~~Versão de 2026-09-29 (base `5bf5a15`)~~: as seções 3 e 4 estavam desatualizadas e foram refeitas.

## 1. Qual arquivo manda quando dois discordam

Ordem de precedência (a de cima vence). Conflito entre dois níveis é **achado**, não escolha
silenciosa — registre em [`agente-ia/10-auditoria/`](agente-ia/10-auditoria/).

| # | Fonte | Manda em |
|---|---|---|
| 1 | Código em `src/agent/` + espelho `supabase/functions/turn/` | O que a agente **de fato** faz (no repositório — produção pode estar atrás, ver §4) |
| 2 | [`documentacao/contexto-negocio/05-decisoes-firmes.md`](documentacao/contexto-negocio/05-decisoes-firmes.md) | Regra de negócio que não se reabre |
| 3 | [`documentacao/decisoes/03-decisoes-tomadas.md`](documentacao/decisoes/03-decisoes-tomadas.md) | Decisão datada, por rodada; a rodada mais nova vence |
| 4 | [`documentacao/decisoes/04-grafo-de-decisoes.md`](documentacao/decisoes/04-grafo-de-decisoes.md) | Por que cada gate/estado é como é, e o que já falhou |
| 5 | [`documentacao/contexto-negocio/`](documentacao/contexto-negocio/) 01–03, 06 | Oferta, público, economia, modelo econômico |
| 6 | [`agente-ia/01-conhecimento/`](agente-ia/01-conhecimento/) | O que a agente pode dizer (objeções, medidas) |
| 7 | [`agente-ia/06-script/`](agente-ia/06-script/), [`02-especificacao/`](agente-ia/02-especificacao/) | Script, templates, especificação |
| 8 | [`../HANDOFF.md`](../HANDOFF.md), [`../.claude/memory/`](../.claude/memory/) | Estado da sessão e armadilhas — **não é fonte de regra** |

`config/business.example.json` é o espelho do secret `BUSINESS_CONFIG`; o valor que a produção
aplica é o do secret.

## 2. Pergunta → arquivo

| Quero saber… | Abra |
|---|---|
| Preço, kits, frete por caminho, prazo, garantia, **troca (R$ 27,00)** | [`contexto-negocio/01-produto-e-oferta.md`](documentacao/contexto-negocio/01-produto-e-oferta.md) |
| O que a agente nunca pode prometer | [`05-decisoes-firmes.md`](documentacao/contexto-negocio/05-decisoes-firmes.md) + [`agente-ia/02-especificacao/04-guardrails.md`](agente-ia/02-especificacao/04-guardrails.md) |
| Quanto se ganha por venda (1/2/3 peças, COD × antecipado) | [`contexto-negocio/06-modelo-economico.md`](documentacao/contexto-negocio/06-modelo-economico.md), caixa de 2026-09-29 (as caixas mais antigas são histórico) |
| Onde tem pagamento na entrega | [`agente-ia/07-cobertura/`](agente-ia/07-cobertura/) |
| O texto exato da agente e dos templates Meta | [`agente-ia/06-script/02-script-do-agente.md`](agente-ia/06-script/02-script-do-agente.md), [`03-templates-meta.md`](agente-ia/06-script/03-templates-meta.md) |
| Por que um gate veta a frase X | [`04-grafo-de-decisoes.md`](documentacao/decisoes/04-grafo-de-decisoes.md) (busque a frase) |
| O que o sistema **não** faz de propósito (RAG, tool-calling…) | [`../CLAUDE.md`](../CLAUDE.md) §Arquitetura |
| O que falta até produção real | [`agente-ia/05-plano/09-pipeline-ate-producao.md`](agente-ia/05-plano/09-pipeline-ate-producao.md) |
| O que está contraditório hoje | [`agente-ia/10-auditoria/2026-09-29-auditoria.md`](agente-ia/10-auditoria/2026-09-29-auditoria.md) |
| Como ligar o WhatsApp Cloud API, e como o áudio é transcrito | [`operacao/whatsapp-cloud-api.md`](operacao/whatsapp-cloud-api.md) |
| Como auditar uma conversa real (SQL, 4 leituras, checklist) | [`operacao/auditar-conversa-real.md`](operacao/auditar-conversa-real.md) |
| Cada webhook e API que a Malu usa, como se autentica e como provar (2026-10-09) | [`operacao/frentes-de-integracao.md`](operacao/frentes-de-integracao.md) |
| O portal de análise de dados: o pedido, as decisões abertas e o que o banco já tem | [`agente-ia/05-plano/11-portal-briefing.md`](agente-ia/05-plano/11-portal-briefing.md) |
| Os testes reais e o que cada um achou | [`10-auditoria/`](agente-ia/10-auditoria/): [`2026-10-06-teste-real-leila.md`](agente-ia/10-auditoria/2026-10-06-teste-real-leila.md), [`2026-10-07-checklist-teste-real.md`](agente-ia/10-auditoria/2026-10-07-checklist-teste-real.md), [`2026-10-07-diagnostico-v12.md`](agente-ia/10-auditoria/2026-10-07-diagnostico-v12.md), [`2026-10-07-teste-real-leila-2.md`](agente-ia/10-auditoria/2026-10-07-teste-real-leila-2.md) (com a tabela "Situação depois do conserto") |
| Devolução e troca guiadas (rascunho, não aprovado) | [`agente-ia/06-script/06-devolucao-guiada.md`](agente-ia/06-script/06-devolucao-guiada.md) |
| O que o Hermes já sabe de partida | [`../hermes/historico-inicial.md`](../hermes/historico-inicial.md) |
| Segredos e onde ficam | [`operacao/segredos-e-codespace.md`](operacao/segredos-e-codespace.md) |
| Hermes (supervisor offline) | [`../hermes/README.md`](../hermes/README.md) |
| Meta Ads, CTWA, Conversions API | repositório [`encorpa-campanhas`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-) |

## 3. O código em uma tela

| Pasta | O que é | Roda onde |
|---|---|---|
| `src/agent/` | Gates, prompt, régua, estado, tamanho, endereço, identidade | Testes (Node); **espelhado byte a byte** em `supabase/functions/turn/` |
| `supabase/functions/turn/` | A Edge Function do turno (Deno) — o que a produção executa | Supabase |
| `supabase/functions/whatsapp/` | Entrada do WhatsApp Cloud API, com transcrição de nota de voz (`vendor/` = decodificador de Opus; `deno.json` + `deno.lock`); canal ligado desde 2026-10-06 | Supabase |
| `supabase/migrations/` | 0001–0024 em disco (0024 aplicada em produção, segundo o `HANDOFF.md`; as demais não reconferidas no banco hoje) | Postgres |
| `n8n/workflows/` | Cano e relógio: turno, régua, venda confirmada, envio WhatsApp, responder cliente, decisão do Hermes (6 arquivos) | PikaPods |
| `src/llm/` | Seam único de modelo, preço, provedores (só Meta em uso na conversa) | — |
| `src/dev/` | Ferramentas: simulador, personas, `dev:gates`, `dev:n8n`, `verificar:guardas`, Hermes | Local/CI |
| `tests/` | 69 arquivos `.test.ts`, 7.017 casos (`pnpm test`, 2026-10-08; eram 49 e 5.679 em 2026-09-29) | CI |
| `hermes/` | Skill e config do supervisor offline | GitHub Action |

## 4. Estado em uma frase (2026-10-08, noite)

~~Produção roda a `turn` v41; o canal WhatsApp está desligado; o Hermes nunca rodou~~ — **isso era de
2026-09-29 e deixou de ser verdade.** Hoje, segundo o `HANDOFF.md` (a API de gerência não foi consultada
nesta edição): a `turn` no ar é a `agent_version` 14 (função v88), o canal WhatsApp está ligado desde
2026-10-06 e transcreve notas de voz, o Hermes foi instalado e calibrado em 2026-09-25 e roda pela Action. A
próxima etapa é o L2 (testes reais de checkout pelo operador e pelo sócio). O andamento do pipeline 80/20
fica no quadro do topo do [`HANDOFF.md`](../HANDOFF.md) e no bloco "Estado em 2026-10-08" de
[`09-pipeline-ate-producao.md`](agente-ia/05-plano/09-pipeline-ate-producao.md).

## 5. Pastas com número faltando (não é arquivo perdido)

`agente-ia/` pula `04-`; `05-plano/` pula `01-`; `contexto-negocio/` pula `04-`; `decisoes/` tem **dois** `04-`
(`04-frete-e-desconto-do-antecipado.md` e `04-grafo-de-decisoes.md`). Renumerar quebraria dezenas
de links citados em commits e no grafo — fica como está, registrado aqui.
