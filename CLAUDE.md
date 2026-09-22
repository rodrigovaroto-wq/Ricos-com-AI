# ricos-com-ai

> Memória de projeto para o Claude Code. Mantenha este arquivo curto e de alto sinal.
> Estrutura de execução baseada no [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit) (MIT).

## Behavioral guidelines

1. **Think before coding** — state assumptions explicitly. If multiple interpretations exist, present them instead of picking silently. Say so when a simpler approach exists. If something is genuinely unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem. No speculative features, no abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios.
3. **Surgical changes** — touch only what the request requires. Match existing style. Don't refactor, reformat, or "improve" adjacent code that wasn't part of the request.
4. **Goal-driven execution** — turn tasks into verifiable goals (e.g. "fix the bug" becomes "write a test that reproduces it, then make it pass"). For multi-step work, state a brief plan with a verify check per step, then loop until every step is verified.
5. **Orchestrator when there is someone to orchestrate** — when the specialists in the routing table below are actually installed, the main session plans, decides and coordinates instead of implementing, dispatching them in parallel when task scopes don't conflict. While they are not installed, the main session implements directly: there is nowhere to delegate to, and refusing to implement would stop the work entirely.

## Stack

TypeScript `strict` · Node.js 24 LTS · pnpm · Playwright (CDP) · **Supabase (Postgres)** · **n8n** · **WhatsApp Cloud API** · **[Hermes Agent](https://github.com/NousResearch/hermes-agent)**.

Versões estáveis, fixadas no lockfile. Sem alpha, beta, RC ou canary sem necessidade comprovada.

**Quem faz o quê** (rodada 5 — ver [`docs/documentacao/decisoes/03-decisoes-tomadas.md`](docs/documentacao/decisoes/03-decisoes-tomadas.md) §R5.2–§R5.7; canal atualizado em 2026-09-21, ver [`docs/documentacao/contexto-negocio/05-decisoes-firmes.md`](docs/documentacao/contexto-negocio/05-decisoes-firmes.md) §1):

- **Supabase** — todo o estado: leads, conversas, mensagens, pedidos, follow-ups, custo por chamada de modelo, trace de guardrail. Substitui o SQLite que este arquivo fixava antes.
- **n8n** — cano e relógio: webhook de entrada, enfileiramento, crons de varredura, webhook da Coinzz, notificação de handoff. **Não** guarda regra de negócio: guardrails, máquina de estados e teto de custo são código versionado com teste.
- **WhatsApp Cloud API** — transporte oficial do WhatsApp (Meta), habilitado pelo CNPJ da operação. Substitui o WAHA (transporte não oficial via sessão de WhatsApp Web) decidido antes da confirmação do CNPJ — a troca elimina a necessidade de processo de sessão vivo 24/7 e de pacing anti-banimento. Mensagens fora da janela de atendimento de 24h (follow-up, recuperação de carrinho) exigem template pré-aprovado pela Meta.
- **PikaPods** — hospeda o que ainda precisa ficar de pé (n8n, e o que mais não migrar para serverless). Deixou de existir só por causa do WAHA.
- **Hermes Agent** — supervisor **offline**: lê as conversas em lote, fora do caminho do
  turno, e **propõe** mudanças em `hermes_proposals`; nunca publica em produção sozinho e
  nunca é chamado durante uma conversa (R11.2).

## Arquitetura — decidida na rodada 11 (2026-09-22)

O desenho do runtime deixou de ser implícito. Ver
[`docs/documentacao/decisoes/03-decisoes-tomadas.md` §Rodada 11](docs/documentacao/decisoes/03-decisoes-tomadas.md#rodada-11--arquitetura-do-sistema-2026-09-22)
e a análise que a originou em
[`docs/agente-ia/05-plano/04-analise-de-arquitetura.md`](docs/agente-ia/05-plano/04-analise-de-arquitetura.md).

**O que o sistema é:** *Workflow + LLM com auto-reflexão.* O modelo **só escreve texto**;
toda ação — tamanho, endereço, identidade, cobertura, checkout, régua — é TypeScript
determinístico em volta da chamada. Quando um gate veta, o motivo volta ao modelo e ele
reescreve; o texto vetado nunca entra no histórico da conversa.

**Cinco coisas que este projeto decidiu NÃO fazer** — reabrir exige motivo novo, não
preferência:

| Não fazer | Por quê |
|---|---|
| **Tool-calling na conversa** (R11.1) | Trocaria código determinístico e testado por escolha do modelo, num funil cuja falha típica é uma promessa que custa o frete inteiro |
| **RAG** (R11.4) | A base de conhecimento tem 104 linhas e já cabe no prompt. RAG traria um modo de falha — recuperação que falha — que a arquitetura inteira existe para evitar |
| **Vector store para memória** (R11.5) | O fato durável do lead é uma coluna `jsonb` em `leads`, escrita por extrator determinístico |
| **Hermes dentro do turno** (R11.2) | Terceira chamada de modelo, com teto de R$ 1,50 por conversa e ritmo em milissegundos. Custo e latência sem ganho |
| **Auto-aplicar melhoria em produção** (R11.6) | O loop fecha num humano. O `BUSINESS_CONFIG` já bloqueia isso fisicamente — **não remova essa barreira** |

**A Evaluation Layer são views SQL e um job** (R11.3), não um serviço. **O Sandbox é o CI
deste repositório** (R11.7) — `pnpm test && pnpm dev:conversas && pnpm typecheck:function`
— e não se constrói outro.

**Prompt e gate são a mesma promessa escrita duas vezes.** Toda regra de negócio citada no
system prompt **lê o config**, com o mesmo teste que o gate correspondente usa. **A chave
ausente lê como a verdade de hoje** — chave nova nasce ausente no secret. Para
`freeShipping`, desde 2026-09-22 isso é `=== true` (ausente = não grátis, porque a operação
não oferece frete grátis); antes era `!== false`, quando grátis era a verdade. A regra é
a verdade, não o operador. Até 2026-09-22 nenhum teste cobria o prompt — foi assim que ele
passou doze dias se contradizendo sobre desconto. Desde então `tests/prompt.test.ts` prova
que toda frase que o prompt ensina passa a cadeia de gates; **mudou prompt ou gate, esse
teste roda**. Ver
[`.claude/memory/prompt-nao-e-coberto-por-teste.md`](.claude/memory/prompt-nao-e-coberto-por-teste.md).

**Provedor de modelo** (rodada 7 — §R7.1; conversa trocada em 2026-09-10, ver `HANDOFF.md`
§Frente 5): `muse-spark-1.3` (Meta) para a conversa que converte — era `gpt-5.6-luna`
(OpenAI) — `gemini-3.5-flash-lite` para o trabalho barato e para todo o desenvolvimento.
Toda chamada passa por um seam único, com teto de custo e trace — o provedor é
configuração, não arquitetura. **O eval de conversão/recusa de gate contra o modelo
antigo não foi rodado** — a troca subiu o mecanismo, não a prova.

## Canonical commands

Always use the exact commands here — don't guess.

- **Install:** `pnpm install`
- **Lint:** `pnpm lint`
- **Typecheck:** `pnpm typecheck`
- **Test:** `pnpm test`
- **Build:** `pnpm build`
- **Run/Dev:** `pnpm dev`

Mais um, que não é opcional: **`pnpm typecheck:function`** roda `deno check` sobre
`supabase/functions/turn/index.ts`. O `tsconfig` não cobre aquele arquivo
(`include: ["src", "tests"]`), então esta é a única coisa que olha o código que a
produção executa de verdade. Rodar antes de todo deploy — o CI já roda.

> Todos existem no `package.json` e passam. O CI
> ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) roda os quatro mais o
> `typecheck:function` em todo push e PR.

> Os tutoriais em `docs/documentacao/tools/` citam `npm` porque reproduzem a documentação de
> cada ferramenta. Neste projeto, o gerenciador é `pnpm` — as linhas acima são
> as que valem.

## Specialist agent routing table

> **Os agentes existem desde 2026-09-10**, em [`.claude/agents/`](.claude/agents/) —
> doze arquivos, escritos contra este repositório e não genéricos: cada um carrega as
> armadilhas que já custaram deploy aqui (o espelho byte a byte, o `??` do
> `BUSINESS_CONFIG`, a cegueira a negação). A triagem que os originou está em
> [`docs/agente-ia/03-pesquisa/05-corpus-de-agentes-agency.md`](docs/agente-ia/03-pesquisa/05-corpus-de-agentes-agency.md),
> reavaliada no mesmo dia em
> [`docs/agente-ia/03-pesquisa/06-reavaliacao-do-time.md`](docs/agente-ia/03-pesquisa/06-reavaliacao-do-time.md) —
> leia antes de propor um décimo terceiro.
>
> Despache o especialista que casa com a tarefa em vez de um agente genérico. **Só o
> `orchestrator` commita** — ver a regra de ondas paralelas.

| Agent | When to use |
|---|---|
| `orchestrator` | Coordena tarefa multi-domínio, forma as ondas paralelas e é o único que commita. Use quando a tarefa cruza domínios ou tem passos independentes. |
| `backend-specialist` | Edge Function (Deno), Supabase/Postgres, máquina de estados, régua, `BusinessConfig`. Conhece as duas armadilhas de deploy. |
| `prompt-engineer` | Prompt da agente e briefing de gate: versionamento, changelog, três casos por comportamento, eval entre modelos. |
| `conversation-designer` | O que a agente fala em PT-BR: script, objeção (AECR), régua, escalação em três níveis, handoff com briefing. |
| `pricing-guardian` | Preço, frete, desconto, margem. Recusa promessa que a conta não sustenta, com análise de sensibilidade. |
| `workflow-architect` | Contrato de handoff, estado observável, governança dos três workflows n8n. |
| `model-cost-governor` | Teto de custo por lead, fallback de provedor, circuit breaker, troca de modelo com eval. |
| `test-engineer` | Teste com TDD, cobertura de negação, prova pela porta de produção. Default é NEEDS WORK. |
| `code-reviewer` | Revisa por correção, erro, cobertura e diff mínimo — não por estilo. Use depois de editar qualquer fonte. |
| `security-reviewer` | Varre segredo e dado de cliente **antes** de tudo, depois webhook, entrada não confiável e injeção de prompt. |
| `technical-writer` | Mantém `HANDOFF.md`, `CLAUDE.md` e `docs/` corrigidos e datados. Use depois de deploy, decisão do operador, ou qualquer mudança que torne uma linha de documentação falsa. |
| `compliance-reviewer` | LGPD (retenção, dado de cliente), CDC (arrependimento, pagamento na entrega) e regra de anúncio com apelo de corpo/saúde. Use ao mexer em retenção, troca/reembolso, ou claim de produto. |

**Modelo por agente** (decisão do operador, 2026-09-22), fixado no frontmatter de cada
arquivo com `model:` — nenhum herda da sessão:

- **`opus`** — `code-reviewer`, `security-reviewer`, `compliance-reviewer`, `test-engineer`,
  `pricing-guardian`, `prompt-engineer`, `backend-specialist`, `orchestrator`. São a rede de
  segurança e os donos de gate, prompt e banco de produção.
- **`sonnet`** — `conversation-designer`, `technical-writer`, `model-cost-governor`,
  `workflow-architect` e as doze `persona-*`.

**A regra acima da tabela:** tarefa que mexe em **gate, heurística de texto ou banco de
produção** vai para Opus, seja qual for o agente — despache com `model: "opus"` na chamada.
Idem o `model-cost-governor` quando for desenhar o eval de modelo. O motivo tem data: em
2026-09-22 dois furos de gate foram escritos pelo implementador e pegos pelo revisor — a
revisão é onde o modelo mais forte se paga. Revertível por arquivo; o critério para reverter
é retrabalho por tarefa, não tokens.

**Não existe `frontend-specialist`, de propósito.** Este repositório não tem UI: os dois
`.html` em `docs/operacao/` são relatório estático do operador, não produto. Agente sem
território é agente que inventa trabalho.

## Regras adicionais

- [`.claude/rules/parallel-subagent-driven-development.md`](.claude/rules/parallel-subagent-driven-development.md) — protocolo de ondas paralelas: quando é seguro despachar subagentes ao mesmo tempo e quem pode commitar.

## Memória entre sessões

@.claude/memory/INSTRUCTIONS.md

Leia o índice [`.claude/memory/MEMORY.md`](.claude/memory/MEMORY.md) antes de
começar qualquer trabalho.

## Guia de execução do produto

`docs/` tem três compartimentos, para não confundir arquivo de um front com o de
outro:

| Pasta | Trata de |
|---|---|
| [`docs/documentacao/`](docs/documentacao/) | Contexto de negócio, decisões, padrões de engenharia, tutorial das ferramentas do fluxo |
| [`docs/agente-ia/`](docs/agente-ia/) | **Frente ativa.** O agente de vendas no WhatsApp: negócio e economia do pagamento na entrega, base de conhecimento, especificação funcional, pesquisa em repositórios open source com evidência por arquivo e linha, lacunas e decisões em aberto |
| [`docs/campanhas-e-anuncios/`](https://github.com/rodrigovaroto-wq/encorpa-campanhas-) | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API |

Leia [`docs/agente-ia/README.md`](docs/agente-ia/README.md) antes de trabalhar no
agente.

## Conventions

**Idioma.** Interface em PT-BR: menus, botões, títulos, formulários, validações,
alertas, notificações, estados vazios, status, datas, números, textos de
acessibilidade e mensagens de erro do operador. Código em inglês: diretórios,
arquivos, variáveis, funções, componentes, hooks, tipos, tabelas, colunas, status
internos, rotas, payloads, logs, testes, comentários, documentação técnica e
commits. Doc de dev em inglês; manual do operador em português.

**Configuração de negócio.** Nenhum valor real de negócio fica espalhado pelo
código — tudo vem de `config/business.json`, espelhado por
`config/business.example.json` com `{{PLACEHOLDERS}}`.

**Segredos.** Nunca commitar `.env`, `config/business.json`, `.chrome-profile/`
ou qualquer banco local. Já cobertos pelo `.gitignore`.

As demais convenções (Clean Code, segurança e confiabilidade, testes) estão em
[`docs/documentacao/03-padroes-de-engenharia.md`](docs/documentacao/03-padroes-de-engenharia.md).
