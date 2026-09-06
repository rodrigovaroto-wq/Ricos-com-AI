# ricos-com-ai

Repositório com a **estrutura de execução** (como o agente de IA trabalha aqui) e o **guia de execução** (o que vai ser construído: o agente de vendas no WhatsApp, alimentado por Meta Ads).

## 📁 O que tem aqui

| Arquivo | O que é |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Memória de projeto do Claude Code: regras de comportamento, stack, comandos canônicos e tabela de roteamento de subagentes. Carregado em toda sessão. |
| [`.claude/rules/parallel-subagent-driven-development.md`](.claude/rules/parallel-subagent-driven-development.md) | Protocolo de ondas paralelas — quando dois subagentes podem rodar ao mesmo tempo sem colidir em arquivo nem disputar commit. |
| [`.claude/hooks/hook-io.mjs`](.claude/hooks/hook-io.mjs) | Leitura e parse seguros de evento de hook (guarda contra o `JSON.parse("null")`, que não lança erro). |
| [`.claude/settings.json.example`](.claude/settings.json.example) | Exemplo de configuração de hooks e variáveis de ambiente. Copie para `.claude/settings.json` e ajuste. |
| [`.claude/memory/`](.claude/memory/) | Sistema de memória entre sessões, camada 1: `INSTRUCTIONS.md` (critério de salvamento e política de crescimento) e `MEMORY.md` (o índice, sempre carregado). |
| [`docs/agente-ia/`](docs/agente-ia/) | **O guia de execução.** Contexto completo do agente de vendas no WhatsApp: negócio, base de conhecimento, especificação funcional, pesquisa em repositórios open source, plano de construção. |
| [`docs/campanhas-e-anuncios/`](docs/campanhas-e-anuncios/) | Meta Ads: os dois caminhos de venda, atribuição de CTWA, Conversions API. |
| [`docs/documentacao/`](docs/documentacao/) | Contexto de negócio, decisões, padrões de engenharia, e o tutorial das 14 ferramentas do fluxo de execução (Superpowers, orquestração de subagentes, quality gates, memória, hooks, MCPs). |

## 🚀 Como usar

### 1. Ative a estrutura de execução

```bash
cp .claude/settings.json.example .claude/settings.json
```

O [`CLAUDE.md`](CLAUDE.md) já está preenchido com a stack e os comandos canônicos. Os scripts ainda não existem no `package.json` — quando o projeto for gerado, use exatamente esses nomes.

Se é sua primeira vez com esse fluxo, comece pelo [playbook de onboarding](docs/documentacao/02-playbook-onboarding.md).

### 2. Leia o guia de execução

Comece por [`docs/agente-ia/README.md`](docs/agente-ia/README.md) — explica a ordem de leitura do contexto de negócio, da especificação do agente e das lacunas ainda em aberto. Para o lado de campanha/anúncio, [`docs/campanhas-e-anuncios/README.md`](docs/campanhas-e-anuncios/README.md).

### 3. Construa

Nenhuma arquitetura foi escolhida ainda — as decisões em aberto estão em [`docs/documentacao/decisoes/02-decisoes-em-aberto.md`](docs/documentacao/decisoes/02-decisoes-em-aberto.md) e cabem ao operador.

## 🧠 Memória entre sessões

O `CLAUDE.md` importa `.claude/memory/INSTRUCTIONS.md`, então toda sessão lê as regras de memória sozinha. O índice [`.claude/memory/MEMORY.md`](.claude/memory/MEMORY.md) começa vazio e cresce só com o que passa no teste:

> Uma sessão futura ficaria surpresa e grata de saber disso antes de começar, em vez de descobrir do jeito difícil?

A camada 2 (armazenamento de longo prazo) **ainda não está definida** — de propósito. Quando o índice se aproximar do teto de 130 linhas, aí sim vale decidir o destino (vault do Obsidian, wiki, Notion). Ver [`docs/documentacao/tools/08-obsidian-memory.md`](docs/documentacao/tools/08-obsidian-memory.md).

## 🙏 Créditos

- Estrutura de execução: [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit) — Matheus Gomes (MIT, cópia em [`docs/documentacao/LICENSE-vibe-coding-toolkit`](docs/documentacao/LICENSE-vibe-coding-toolkit))
