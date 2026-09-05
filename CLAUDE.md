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

Next.js (App Router) · React · TypeScript `strict` · Tailwind · SQLite · Drizzle ORM com migrações · Node.js 24 LTS · pnpm · Playwright (CDP) · SDK oficial da OpenAI.

Versões estáveis, fixadas no lockfile. Sem alpha, beta, RC ou canary sem necessidade comprovada.

**Onde roda.** App Node.js num processo próprio, com SQLite em disco persistente. Para o agente de WhatsApp, o operador decidiu **VPS 24/7** (o canal exige sessão viva e o follow-up exige relógio) — ver [`docs/documentacao/decisoes/03-decisoes-tomadas.md`](docs/documentacao/decisoes/03-decisoes-tomadas.md) §Q2. **SQLite não vai para serverless com disco efêmero** — isso continua valendo.

## Canonical commands

Always use the exact commands here — don't guess.

- **Install:** `pnpm install`
- **Lint:** `pnpm lint`
- **Typecheck:** `pnpm typecheck`
- **Test:** `pnpm test`
- **Build:** `pnpm build`
- **Run/Dev:** `pnpm dev`

> Os scripts acima ainda não existem no `package.json` — o projeto não foi
> gerado. Ao criar o `package.json`, use exatamente estes nomes.

> Os tutoriais em `docs/documentacao/tools/` citam `npm` porque reproduzem a documentação de
> cada ferramenta. Neste projeto, o gerenciador é `pnpm` — as linhas acima são
> as que valem.

## Specialist agent routing table

> **Estes agentes ainda não existem neste repositório.** Não há `.claude/agents/`
> nem plugin declarado que os forneça. A tabela é o destino pretendido: enquanto
> ela não for satisfeita, a sessão principal implementa direto, e nada aqui
> autoriza despachar um agente que não está instalado.

Once they exist, dispatch the specialist that matches the task instead of a generic agent.

| Agent | When to use |
|---|---|
| `orchestrator` | Coordinates multi-agent or cross-domain tasks by delegating to specialized agents. Use when a task spans multiple domains or needs parallel subagent execution. |
| `code-reviewer` | Reviews code changes for bugs, security, error handling, and test coverage. Use after editing any source file. |
| `security-reviewer` | Reviews code for OWASP Top 10 vulnerabilities, hardcoded secrets, broken auth, and dependency CVEs. Use before any merge that touches auth, input handling, or secrets. |
| `test-engineer` | Writes unit and integration tests with TDD discipline and edge-case coverage. Use after implementing new logic. |
| `backend-specialist` | Implements API endpoints, server-side logic, and persistence. Use when building or modifying backend services. |
| `frontend-specialist` | Designs and implements UI components, layouts, and frontend performance. Use when building or refactoring UI. |

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
| [`docs/campanhas-e-anuncios/`](docs/campanhas-e-anuncios/) | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API |

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
