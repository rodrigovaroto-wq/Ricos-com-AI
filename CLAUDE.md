# ricos-com-ai

> Memória de projeto para o Claude Code. Mantenha este arquivo curto e de alto sinal.
> Estrutura de execução baseada no [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit) (MIT).

## Behavioral guidelines

1. **Think before coding** — state assumptions explicitly. If multiple interpretations exist, present them instead of picking silently. Say so when a simpler approach exists. If something is genuinely unclear, stop and ask.
2. **Simplicity first** — minimum code that solves the problem. No speculative features, no abstractions for single-use code, no unrequested configurability, no error handling for impossible scenarios.
3. **Surgical changes** — touch only what the request requires. Match existing style. Don't refactor, reformat, or "improve" adjacent code that wasn't part of the request.
4. **Goal-driven execution** — turn tasks into verifiable goals (e.g. "fix the bug" becomes "write a test that reproduces it, then make it pass"). For multi-step work, state a brief plan with a verify check per step, then loop until every step is verified.
5. **Orchestrator, not implementer** — the main session plans, decides, and coordinates; it does not implement. Delegable implementation and analysis goes to a specialist subagent, dispatched in parallel when task scopes don't conflict.

## Stack

Next.js (App Router) · React · TypeScript `strict` · Tailwind · SQLite · Drizzle ORM com migrações · Node.js 24 LTS · pnpm · Playwright (CDP) · SDK oficial da OpenAI.

Versões estáveis, fixadas no lockfile. Sem alpha, beta, RC ou canary sem necessidade comprovada. Roda como app Node.js local — SQLite não vai para serverless com disco efêmero.

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

## Specialist agent routing table

When work is delegable, dispatch the specialist that matches the task instead of a generic agent.

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

O que este repositório constrói está descrito em [`docs/PROMPT.md`](docs/PROMPT.md) — o prompt único que gera o sistema comercial autônomo. O bloco `CONFIGURAÇÃO` no topo dele ainda tem `{{PLACEHOLDERS}}` a preencher.

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

As demais convenções (estrutura de pastas, camadas, tratamento de erro, testes)
estão detalhadas nas seções *Arquitetura de software*, *Clean Code*, *Segurança e
confiabilidade* e *Testes* de [`docs/PROMPT.md`](docs/PROMPT.md).
