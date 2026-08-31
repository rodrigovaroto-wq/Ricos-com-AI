# ricos-com-ai

Repositório com a **estrutura de execução** (como o agente de IA trabalha aqui) e o **guia de execução** (o que vai ser construído).

## 📁 O que tem aqui

| Arquivo | O que é |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Memória de projeto do Claude Code: regras de comportamento, stack, comandos canônicos e tabela de roteamento de subagentes. Carregado em toda sessão. |
| [`.claude/rules/parallel-subagent-driven-development.md`](.claude/rules/parallel-subagent-driven-development.md) | Protocolo de ondas paralelas — quando dois subagentes podem rodar ao mesmo tempo sem colidir em arquivo nem disputar commit. |
| [`.claude/hooks/hook-io.mjs`](.claude/hooks/hook-io.mjs) | Leitura e parse seguros de evento de hook (guarda contra o `JSON.parse("null")`, que não lança erro). |
| [`.claude/settings.json.example`](.claude/settings.json.example) | Exemplo de configuração de hooks e variáveis de ambiente. Copie para `.claude/settings.json` e ajuste. |
| [`.claude/memory/`](.claude/memory/) | Sistema de memória entre sessões, camada 1: `INSTRUCTIONS.md` (critério de salvamento e política de crescimento) e `MEMORY.md` (o índice, sempre carregado). |
| [`docs/PROMPT.md`](docs/PROMPT.md) | **O guia de execução.** Prompt único que constrói um sistema comercial autônomo no Instagram. Preencha o bloco `CONFIGURAÇÃO` no topo antes de usar. |
| [`docs/tools/`](docs/tools/) | Referência das 14 ferramentas do fluxo — Superpowers, orquestração de subagentes, quality gates, memória, hooks e MCPs. Cada arquivo é autocontido. |
| [`docs/prompts/`](docs/prompts/) | 7 prompts prontos para colar e adaptar — sanitização de projeto, burndown de ESLint, code review multi-agente, brainstorm-to-plan, wave dispatch, memory bootstrap, setup de ESLint. |
| [`docs/00-overview.md`](docs/00-overview.md) · [`01-installation.md`](docs/01-installation.md) · [`02-playbook-onboarding.md`](docs/02-playbook-onboarding.md) | Fundamentos: a filosofia do fluxo, os comandos de instalação e o playbook de onboarding passo a passo. |

## 🚀 Como usar

### 1. Ative a estrutura de execução

```bash
cp .claude/settings.json.example .claude/settings.json
```

O [`CLAUDE.md`](CLAUDE.md) já está preenchido com a stack (Next.js · TypeScript `strict` · Tailwind · SQLite + Drizzle · pnpm · Playwright · SDK da OpenAI) e os comandos canônicos. Os scripts ainda não existem no `package.json` — quando o projeto for gerado, use exatamente esses nomes.

Se é sua primeira vez com esse fluxo, comece pelo [playbook de onboarding](docs/02-playbook-onboarding.md).

### 2. Preencha o guia de execução

Abra [`docs/PROMPT.md`](docs/PROMPT.md) e troque cada `{{PLACEHOLDER}}` do bloco `CONFIGURAÇÃO` pelos dados reais do negócio.

Dois campos merecem atenção especial:

- **`VERIFIED_CLAIMS`** — só o que dá pra provar hoje. É a única coisa que a IA pode afirmar pro lead.
- **`UNVERIFIED_CLAIMS`** — o que se quer dizer mas ainda não foi comprovado. Fica bloqueado até virar prova.

### 3. Rode

Cole o `docs/PROMPT.md` preenchido, do começo ao fim, numa task do agente.

## 🧠 Memória entre sessões

O `CLAUDE.md` importa `.claude/memory/INSTRUCTIONS.md`, então toda sessão lê as regras de memória sozinha. O índice [`.claude/memory/MEMORY.md`](.claude/memory/MEMORY.md) começa vazio e cresce só com o que passa no teste:

> Uma sessão futura ficaria surpresa e grata de saber disso antes de começar, em vez de descobrir do jeito difícil?

A camada 2 (armazenamento de longo prazo) **ainda não está definida** — de propósito. Quando o índice se aproximar do teto de 130 linhas, aí sim vale decidir o destino (vault do Obsidian, wiki, Notion). Ver [`docs/tools/08-obsidian-memory.md`](docs/tools/08-obsidian-memory.md).

## 🙏 Créditos

- Estrutura de execução: [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit) — Matheus Gomes (MIT, cópia em [`docs/LICENSE-vibe-coding-toolkit`](docs/LICENSE-vibe-coding-toolkit))
- Guia de execução: [buscandomilhao](https://github.com/soumatheusgomes/buscandomilhao) — Matheus Gomes
