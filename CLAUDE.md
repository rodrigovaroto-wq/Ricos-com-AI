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

[A PREENCHER: linguagens, frameworks e gerenciador de pacotes — ex. "TypeScript · Next.js + React · pnpm"]

## Canonical commands

Always use the exact commands here — don't guess.

- **Install:** `[A PREENCHER]`
- **Lint:** `[A PREENCHER]`
- **Typecheck:** `[A PREENCHER]`
- **Test:** `[A PREENCHER]`
- **Build:** `[A PREENCHER]`
- **Run/Dev:** `[A PREENCHER]`

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

## Guia de execução do produto

O que este repositório constrói está descrito em [`docs/PROMPT.md`](docs/PROMPT.md) — o prompt único que gera o sistema comercial autônomo. O bloco `CONFIGURAÇÃO` no topo dele ainda tem `{{PLACEHOLDERS}}` a preencher.

## Conventions

[A PREENCHER: estilo de import, convenções de teste, regras de formatação/lint, padrões de tratamento de erro, etc.]
