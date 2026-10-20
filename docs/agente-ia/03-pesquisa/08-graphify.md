# Graphify — o que é, pelo código, e onde encaixa aqui (2026-10-20)

Pedido do operador (2026-10-20): analisar o [Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify) como
consumidor, ver como ele encaixa neste repositório e como a Malu e o Hermes poderiam consultá-lo.

Lido em disco: clone de `main` no commit `86c57be` (release **0.9.92**, pacote PyPI `graphifyy`, Apache-2.0). Cada afirmação
aponta arquivo e linha desse commit. **Executado e medido no mesmo dia** (§5), depois de o operador autorizar a instalação.

## 1. O que ele é, de verdade

Uma CLI Python (≥ 3.10) que transforma uma pasta num grafo `graph.json` + `GRAPH_REPORT.md` + `graph.html`, e responde
perguntas sobre ele (`graphify explain X`, `graphify path A B`, `graphify query "<pergunta>"`). Não é vetor nem embedding:
é um grafo NetworkX que se percorre.

| Peça | Como funciona | Evidência |
|---|---|---|
| Código → nós e arestas | tree-sitter, local, **sem LLM**; TypeScript incluso; SQL com o extra `[sql]` | `pyproject.toml:29`, `:95`, `graphify/extract.py:1` |
| Markdown → nós e arestas | parser linha a linha, **sem LLM**: a página, cada título, `contains` entre títulos, `references` para links `[x](./y.md)` | `graphify/extractors/markdown.py:358-409`, `extract.py:8619` |
| Markdown → código | um `` `nome` `` em crase num doc vira aresta título → função **só se exatamente uma** função/classe do corpus tiver esse nome; ambíguo não vira aresta | `graphify/markdown_resolution.py:21-33`, `:97`, `:191`, `:216` |
| Atualizar sem custo | `graphify update .` → `_rebuild_code`, só AST, inclui `.md` | `graphify/cli.py:2779-2821`, `graphify/watch.py:1677-1687`, `:1828` |
| Passe semântico (LLM) | docs, PDF e imagem, via o modelo do assistente ou chave de API (Gemini, Claude, OpenAI…); `GRAPHIFY_BACKEND=none` desliga | README §Privacy |
| `--code-only` | pula **todo** `.md` — inclusive o estrutural | `graphify/cli.py:4039-4048` |
| Servidor MCP | `query_graph`, `get_node`, `get_neighbors`, `get_community`, `god_nodes`, `graph_stats`, `shortest_path`, mais três de PR | `graphify/serve.py:2202-2322` |
| Instalação por plataforma | Claude Code: skill + bloco no `CLAUDE.md` + hook `PreToolUse` que empurra para o grafo antes de cada Read/Grep. Hermes: skill em `~/.hermes/skills/graphify/` + `AGENTS.md` | `graphify/install.py:208-215`, `:669-672`; `graphify/always_on/agents-md.md:8` |
| Ignorar arquivos | `.graphifyignore` no padrão do `.gitignore`, com `!` | `graphify/detect.py:1468`, `:1564` |
| Memória de trabalho | `save-result` + `reflect`: perguntas marcadas útil/beco/corrigida viram `LESSONS.md` | `graphify/reflect.py:1-25` |
| Log local | toda consulta vai para `~/.cache/graphify-queries.log` (sem a resposta); `GRAPHIFY_QUERY_LOG_DISABLE=1` desliga | README §Privacy |
| Para script | código de saída: `0` resposta, `3` nome ambíguo, `4` nada achado | README §Using the graph directly |

## 2. O que o código diz que muda o encaixe aqui

1. **O espelho byte a byte cega a ponte doc → código.** 17 arquivos de `src/` têm cópia idêntica em `supabase/functions/`
   (`tests/function-drift.test.ts:12-31`). Toda função exportada existe duas vezes, e a regra "só uma com esse nome"
   (`markdown_resolution.py:33`) **descarta** a menção. Medido (§5): sem tratar, `stageForOrder` não recebe nenhuma ligação do grafo
   de decisões. **Tratado:** `.graphifyignore` tira um dos lados. Qual lado foi medido nos dois sentidos (§5.2): fica a **cópia que a
   produção roda** (`supabase/functions/turn/`), porque só assim `handleTurn()` liga a cada gate que chama; os testes, que importam
   `src/agent/`, perdem a aresta e são achados com `git grep -l <nome> tests/`. Quem edita continua editando `src/agent/` e espelhando.
2. **Os gates são strings, não funções.** Os nomes do trace de veto (`delivery_promise`, `shipping_promise`, `coverage_claim`…) são
   `name: "…"` dentro de objetos (`src/agent/guardrails.ts:1416`). O Graphify liga menção a função ou classe, nunca a string. Ele **não**
   responde "quais seções do grafo falam do gate `delivery_promise`" — isso continua sendo `git grep`.
3. **Closures dentro de `handleTurn()` não viram nó.** Medido: `handOff` e `sendFixed` (`supabase/functions/turn/index.ts:2727`, `:3148`)
   não existem no grafo; `graphify explain "handOff()"` cai nos títulos do `HANDOFF.md`. Algumas funções internas de `index.ts` viram
   (`recordOrder()`, `callLuna()`, `scheduleSilenceTouches()`).
4. **Nome genérico em crase liga ao lugar errado.** A regra "só um com esse nome" é sintática: `` `turn` `` (a Edge Function) ligava
   124 vezes ao `turn()` do simulador local; `` `ok` `` das transcrições ligava ao `ok()` de um teste. Tratado no `.graphifyignore`
   (§5.3); o resíduo é ~5 %.
5. **O caminho barato é `graphify update .`, não `/graphify .`.** O `/graphify` completo manda os docs para o passe semântico de um modelo;
   o `update` faz só AST, e `--code-only` jogaria fora justamente os docs.

## 3. Encaixe por consumidor

### 3.1 Sessões do Claude Code (desenvolvimento, `DECIDIR.md`, `IMPLEMENTAR.md`, subagentes) — **sim, é aqui que paga**

O grafo de decisões tem 318 KB (≈ 90 mil tokens) e 118 seções numeradas; o `HANDOFF.md`, 283 KB. A regra do `CLAUDE.md` manda ler o
grafo antes de mexer em gate — inteiro, ninguém lê. `graphify explain "lookupRegion()"` devolve em 2,3 KB quem chama, o que ela chama,
**e as seções do grafo, do `HANDOFF.md`, da memória e do plano que a citam, com linha** (§5.4). É a leitura dirigida que a regra pede.

### 3.2 A Malu (o turno) — **não**

- consultar um grafo no meio do turno é **recuperação** — o modo de falha que o R11.4 recusou;
- escolher o que consultar seria **tool-calling na conversa** (R11.1);
- a base de conhecimento tem 104 linhas e já está inteira no prompt; o fato do lead é `jsonb` em `leads` (R11.5);
- a `turn` roda em Deno na Edge Function e o Graphify é Python — serviço novo no caminho do turno, com latência;
- o grafo é de **código e documentação**, não de produto: nada nele responde a uma cliente.

O ganho para a Malu é indireto: quem mexe no prompt e nos gates dela vê o que já se tentou ali (§6).

### 3.3 O Hermes — **não agora, e não pela instalação oficial**

- `graphify install --platform hermes` instala uma skill que manda **rodar a CLI**. O Hermes daqui roda só com `file,skills,todo`
  (`src/dev/hermes-run.ts:20`, `:257`) — a barreira do R11.6. Dar terminal a quem lê conversa real para chamar o Graphify abre a
  barreira para ganhar pouco.
- O que o Hermes precisaria é "para cada gate que vetou neste lote, o que já se tentou nele" — e pelo item 2.2 o Graphify não liga gate a
  seção. Seria `grep` determinístico no `hermes.yml`, posto no pacote como mais um `.md`, e só se uma proposta repetir um caminho que
  o grafo já descartou (hoje `historico.md` e `decisoes.md` cobrem isso).
- Onde o Graphify toca o loop do Hermes: na **Rotina que implementa** a proposta aprovada (`hermes/IMPLEMENTAR.md`), que é uma sessão
  do Claude Code — herda o §3.1 e o §6.

### 3.4 O que não adotar

| Peça | Por quê |
|---|---|
| Passe semântico (`/graphify .` completo, `--backend`) | Manda os docs a um modelo; o estrutural já cobre títulos, links e menções |
| `graphify query "<pergunta>"` em português | Medido (§5.4): casa palavra, não sentido — "handoff" devolve 50 títulos do `HANDOFF.md`. `explain` e `path` sim |
| `save-result` / `reflect` | Segunda memória ao lado de `.claude/memory/` e do grafo de decisões — duas verdades |
| `graphify claude install` / hook `PreToolUse` | Reescreve o `CLAUDE.md` e intercepta toda leitura |
| `GRAPH_REPORT.md` como leitura de rotina | 90 KB; só para revisão de arquitetura |
| Graphify Cloud | O código sai do repositório para um serviço pago |
| `prs`, `wiki`, `neo4j`, `watch`, MCP | Sem necessidade: a CLI no Bash basta |

## 4. Configuração

- `graphifyy[sql]==0.9.92`, fixado; `GRAPHIFY_BACKEND=none` (nenhum modelo, nenhuma chave); `GRAPHIFY_QUERY_LOG_DISABLE=1`.
- `graphify update .` — reconstrói tudo em ~10 s; `graphify-out/` fora do git (derivado, 5 MB, reescrito inteiro a cada build).
- `.graphifyignore` na raiz, com o motivo de cada linha.
- O tutorial genérico [`tools/07-graphify.md`](../../documentacao/tools/07-graphify.md) e o playbook de onboarding mandam
  `graphify claude install` e `graphify extract .`; aqui não (§3.4) — o tutorial tem um aviso no topo.

## 5. Medição (2026-10-20, container do Claude Code)

### 5.1 Build

| | Valor |
|---|---|
| `graphify update .` (frio e incremental) | 10–11 s, 4 workers |
| Grafo final | 4 260 nós, 7 168 arestas, 296 comunidades |
| Sem `[sql]` | as 28 migrações não entram (aviso explícito) |

### 5.2 Ponte doc → código, por configuração

| `.graphifyignore` | Arestas doc → código | Do grafo de decisões | `explain lookupRegion` mostra |
|---|---|---|---|
| nenhum | 1 331 | 70 | nada do grafo (ambíguo) |
| sem a cópia de `supabase/` | 762 | 282 | testes, seções; **não** `handleTurn` |
| sem `src/agent/` (adotado) | 754 | 283 | `handleTurn` (`index.ts:3786`), seções; **não** testes |
| + transcrições e simulador fora (final) | 629 | 251 | idem, sem falsos `turn()`/`ok()` |

Os 1 331 do primeiro caso incluem ~1 000 `ok()` falsos das transcrições de persona. Final: **68 das 118 seções numeradas** do grafo de
decisões ligam a pelo menos uma função; ~30 das 629 arestas apontam para o lugar errado (nomes genéricos: `data`, `code`, `price`, `state`).

### 5.3 O que o `.graphifyignore` tira, e por quê

`src/agent/` e dois de `src/channel/` (o espelho, item 2.1), `supabase/functions/whatsapp/whatsapp.ts` (idem), o decodificador vendorizado,
as transcrições de `10-auditoria/personas-*` e `testes-reais/` (conversa, não conhecimento — e 220 arquivos), e `src/dev/simulate.ts`
(o `turn()` dele capturava toda menção à Edge Function).

### 5.4 Três perguntas reais, grafo contra `grep`

| Pergunta | `git grep -n` | `graphify` |
|---|---|---|
| `lookupRegion` | 88 linhas, 13,0 KB, 16 arquivos — e ainda falta ler cada seção | `explain`: 2,3 KB; 3 chamadores (inclui `handleTurn`, `index.ts:3786`), 10 títulos de doc que a citam, com linha |
| `stageForOrder` | 72 linhas, 9,9 KB, 20 arquivos | `explain`: 2,5 KB; 7 chamadores, 11 títulos de doc |
| `asksForLink` → `handleTurn` | 65 linhas, 9,4 KB | `path`: 1 salto, `handleTurn` chama direto (`index.ts:4080`); `explain`: §65, §85, M-03, M-09 |
| "o que decide o handoff" (`query`) | — | 6,7 KB de títulos do `HANDOFF.md` casados pela palavra; inútil |

## 6. Como foi implementado (2026-10-20)

**Princípio:** o grafo responde *onde olhar*; a leitura continua no arquivo, na linha que ele apontou. Nada muda na Malu, nos gates
nem no Hermes.

1. **Instalação:** o operador pôs no script de setup do ambiente da nuvem (2026-10-20) a criação de um venv com `graphifyy[sql]==0.9.92` e
   o link para `/usr/local/bin/graphify`. Sem hook no repositório: o `.claude/settings.json` é ignorado pelo git, e o setup do ambiente
   já cobre as sessões novas. Numa máquina sem o comando, a regra manda seguir com `git grep`.
2. **Regra no `CLAUDE.md`** (três linhas, na seção do grafo de decisões): antes de mexer numa função de gate, estado ou handoff,
   `graphify explain "<função>()"` e ler **as seções que ele lista**; relação entre duas funções, `graphify path`; teste que cobre,
   `git grep -l <nome> tests/`; gate por nome (`delivery_promise`), `git grep`. Substitui "leia o grafo" por "leia estas seções".
3. **Subagentes.** Uma linha nos agentes que mexem em código, revisam ou escrevem doc (`backend-specialist`, `prompt-engineer`,
   `code-reviewer`, `test-engineer`, `technical-writer`, `orchestrator`): o revisor ganha "o que esta função já quebrou antes" sem o implementador ter contado.
4. **Escrita que alimenta o grafo.** Toda entrada nova do grafo de decisões, da memória e do `HANDOFF.md` cita a função em crase, com o
   nome exato do código (`` `lookupRegion` ``). Nome genérico (`turn`, `ok`) não vira aresta útil — cite a função de verdade
   (`` `handleTurn` ``). É o que transforma o registro do erro em algo que a próxima sessão encontra pela função que vai mexer.
5. **Depois de editar:** `graphify update .` (10 s) antes de consultar de novo — vale para quem acabou de escrever uma entrada no grafo.
6. **Não feito — guarda opcional, depois de usar uma semana:** um teste que roda `graphify` no CI e falha se uma seção nova do grafo de decisões
   não liga a nenhuma função — só se a regra 4 for esquecida na prática.
