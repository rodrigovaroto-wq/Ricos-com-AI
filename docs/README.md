# Mapa do repositório — onde está cada coisa

Porta de entrada para achar informação sem ler os 2.750 linhas do `HANDOFF.md`. Atualizado em
2026-09-29 (base: `main` em `5bf5a15`, com os PRs #42 e #43 mergeados).

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
| Como ligar o WhatsApp Cloud API | [`operacao/whatsapp-cloud-api.md`](operacao/whatsapp-cloud-api.md) |
| Segredos e onde ficam | [`operacao/segredos-e-codespace.md`](operacao/segredos-e-codespace.md) |
| Hermes (supervisor offline) | [`../hermes/README.md`](../hermes/README.md) |
| Meta Ads, CTWA, Conversions API | repositório [`encorpa-campanhas`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-) |

## 3. O código em uma tela

| Pasta | O que é | Roda onde |
|---|---|---|
| `src/agent/` | Gates, prompt, régua, estado, tamanho, endereço, identidade | Testes (Node); **espelhado byte a byte** em `supabase/functions/turn/` |
| `supabase/functions/turn/` | A Edge Function do turno (Deno) — o que a produção executa | Supabase |
| `supabase/functions/whatsapp/` | Entrada/saída do WhatsApp Cloud API (desligada: `CANAL_ATIVO`) | Supabase |
| `supabase/migrations/` | 0001–0020 (todas aplicadas em produção) | Postgres |
| `n8n/workflows/` | Cano e relógio: turno, régua, venda confirmada, envio WhatsApp, decisão do Hermes | PikaPods |
| `src/llm/` | Seam único de modelo, preço, provedores (só Meta em uso na conversa) | — |
| `src/dev/` | Ferramentas: simulador, personas, `dev:gates`, `dev:n8n`, `verificar:guardas`, Hermes | Local/CI |
| `tests/` | 49 arquivos, 5.679 casos (2026-09-29) | CI |
| `hermes/` | Skill e config do supervisor offline | GitHub Action |

## 4. Estado em uma frase (2026-09-29, noite)

Produção roda a `turn` **v41** (PR #35, 25/09); o `main` tem os PRs #36–#43 sem publicar. O canal
WhatsApp está desligado, e o Hermes de produção nunca rodou (a instalação falha na Action). O
andamento do pipeline 80/20 — feito, falta e próximo passo — está no quadro do topo do
[`HANDOFF.md`](../HANDOFF.md).

## 5. Pastas com número faltando (não é arquivo perdido)

`agente-ia/` pula `04-`; `05-plano/` pula `01-`; `contexto-negocio/` pula `04-`; `decisoes/` tem **dois** `04-`
(`04-frete-e-desconto-do-antecipado.md` e `04-grafo-de-decisoes.md`). Renumerar quebraria dezenas
de links citados em commits e no grafo — fica como está, registrado aqui.
