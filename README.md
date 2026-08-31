# ricos-com-ai

Repositório com a **estrutura de execução** (como o agente de IA trabalha aqui) e o **guia de execução** (o que vai ser construído).

## 📁 O que tem aqui

| Arquivo | O que é |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Memória de projeto do Claude Code: regras de comportamento, stack, comandos canônicos e tabela de roteamento de subagentes. Carregado em toda sessão. |
| [`.claude/rules/parallel-subagent-driven-development.md`](.claude/rules/parallel-subagent-driven-development.md) | Protocolo de ondas paralelas — quando dois subagentes podem rodar ao mesmo tempo sem colidir em arquivo nem disputar commit. |
| [`.claude/hooks/hook-io.mjs`](.claude/hooks/hook-io.mjs) | Leitura e parse seguros de evento de hook (guarda contra o `JSON.parse("null")`, que não lança erro). |
| [`.claude/settings.json.example`](.claude/settings.json.example) | Exemplo de configuração de hooks e variáveis de ambiente. Copie para `.claude/settings.json` e ajuste. |
| [`docs/PROMPT.md`](docs/PROMPT.md) | **O guia de execução.** Prompt único que constrói um sistema comercial autônomo no Instagram. Preencha o bloco `CONFIGURAÇÃO` no topo antes de usar. |

## 🚀 Como usar

### 1. Ative a estrutura de execução

```bash
cp .claude/settings.json.example .claude/settings.json
```

Depois preencha os `[A PREENCHER]` do [`CLAUDE.md`](CLAUDE.md) — stack, comandos canônicos e convenções — assim que a stack do projeto estiver decidida.

### 2. Preencha o guia de execução

Abra [`docs/PROMPT.md`](docs/PROMPT.md) e troque cada `{{PLACEHOLDER}}` do bloco `CONFIGURAÇÃO` pelos dados reais do negócio.

Dois campos merecem atenção especial:

- **`VERIFIED_CLAIMS`** — só o que dá pra provar hoje. É a única coisa que a IA pode afirmar pro lead.
- **`UNVERIFIED_CLAIMS`** — o que se quer dizer mas ainda não foi comprovado. Fica bloqueado até virar prova.

### 3. Rode

Cole o `docs/PROMPT.md` preenchido, do começo ao fim, numa task do agente.

## 🙏 Créditos

- Estrutura de execução: [vibe-coding-toolkit](https://github.com/soumatheusgomes/vibe-coding-toolkit) — Matheus Gomes (MIT, cópia em [`docs/LICENSE-vibe-coding-toolkit`](docs/LICENSE-vibe-coding-toolkit))
- Guia de execução: [buscandomilhao](https://github.com/soumatheusgomes/buscandomilhao) — Matheus Gomes
